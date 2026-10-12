//! Android JNI 适配。句柄注册表防止释放后的指针访问；所有 panic 在 JNI 边界转为异常。

use anyhow::{anyhow, ensure, Result};
use bbkemu_core::{input::BbkKey, model, save::SaveState, Emulator};
use bincode::Options;
use jni::{
    objects::{JByteArray, JIntArray, JObject, JShortArray, JString},
    sys::{jboolean, jbyteArray, jint, jlong, jstring},
    JNIEnv,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicI64, Ordering},
        Mutex, OnceLock,
    },
};

const PIXELS: usize = 159 * 96;
const SRAM_LENGTH: usize = 0x14000;
const MAX_STATE: u64 = 8 * 1024 * 1024;
static SESSIONS: OnceLock<Mutex<BTreeMap<i64, Session>>> = OnceLock::new();
static NEXT_ID: AtomicI64 = AtomicI64::new(1);

struct Search {
    space: String,
    width: usize,
    previous: Vec<u8>,
    candidates: Vec<usize>,
}

struct Session {
    core: Emulator,
    identity: String,
    argb: Vec<i32>,
    audio: Vec<f32>,
    pcm: Vec<i16>,
    search: Option<Search>,
}

#[derive(Serialize, Deserialize)]
struct Snapshot {
    magic: [u8; 8],
    identity: String,
    state: SaveState,
}

fn sessions() -> &'static Mutex<BTreeMap<i64, Session>> {
    SESSIONS.get_or_init(|| Mutex::new(BTreeMap::new()))
}

/// 异常隔离仅负责保护宿主；遇到失败由 Kotlin 停止帧循环，不能继续运行损坏会话。
fn guarded<T: Default>(env: &mut JNIEnv, operation: impl FnOnce(&mut JNIEnv) -> Result<T>) -> T {
    match catch_unwind(AssertUnwindSafe(|| operation(env))) {
        Ok(Ok(value)) => value,
        result => {
            let message = match result {
                Ok(Err(error)) => error.to_string(),
                _ => "模拟器内部异常，会话已停止".to_string(),
            };
            let _ = env.throw_new("java/lang/IllegalStateException", message);
            T::default()
        }
    }
}

fn with_session<T>(id: i64, operation: impl FnOnce(&mut Session) -> Result<T>) -> Result<T> {
    let mut entries = sessions()
        .lock()
        .map_err(|_| anyhow!("模拟会话发生异常，请退出游戏重试"))?;
    operation(
        entries
            .get_mut(&id)
            .ok_or_else(|| anyhow!("游戏会话已释放"))?,
    )
}

/// 创建前要求两份完整 ROM，禁止缺失 ROM 时启动并显示看似卡死的空白帧。
#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_create(
    mut env: JNIEnv,
    _this: JObject,
    machine: jint,
    gam: JByteArray,
    font: JByteArray,
    os: JByteArray,
) -> jlong {
    guarded(&mut env, |env| {
        ensure!(machine == 4980 || machine == 4988, "未知机型");
        ensure!(
            (0x46..=0x1e0000).contains(&env.get_array_length(&gam)?),
            "GAM 长度无效"
        );
        ensure!(
            env.get_array_length(&font)? == 0x200000 && env.get_array_length(&os)? == 0x200000,
            "系统和字库 ROM 必须为 2MiB"
        );
        let gam = env.convert_byte_array(&gam)?;
        let font = env.convert_byte_array(&font)?;
        let os = env.convert_byte_array(&os)?;
        ensure!(
            font.len() == 0x200000 && os.len() == 0x200000,
            "系统和字库 ROM 必须为 2MiB"
        );
        let mut digest = Sha256::new();
        digest.update(machine.to_le_bytes());
        digest.update(&gam);
        digest.update(&font);
        digest.update(&os);
        let identity = format!("{:x}", digest.finalize());
        let machine = if machine == 4988 {
            &model::MODEL_4988
        } else {
            &model::MODEL_4980
        };
        let mut core = Emulator::new(machine);
        core.load_rom_8(&font);
        core.load_rom_e(&os);
        core.load_gam(&gam)?;
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        ensure!(id > 0, "会话标识耗尽");
        sessions()
            .lock()
            .map_err(|_| anyhow!("无法创建会话"))?
            .insert(
                id,
                Session {
                    core,
                    identity,
                    argb: vec![0; PIXELS],
                    audio: vec![0.0; 735],
                    pcm: vec![0; 735],
                    search: None,
                },
            );
        Ok(id)
    })
}

/// 帧与音频复用 Java 数组，不经过 Flutter 通道逐帧传输。
#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_frame(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
    pixels: JIntArray,
    audio: JShortArray,
) -> jboolean {
    guarded(&mut env, |env| {
        with_session(id, |session| {
            ensure!(
                env.get_array_length(&pixels)? as usize == PIXELS,
                "像素数组长度错误"
            );
            ensure!(env.get_array_length(&audio)? == 735, "音频数组长度错误");
            session.core.run_frame();
            let source = session.core.render_lcd_buffer();
            for (pixel, enabled) in session.argb.iter_mut().zip(source.iter()) {
                *pixel = if *enabled {
                    0xff102018u32 as i32
                } else {
                    0xffa8ba9bu32 as i32
                };
            }
            session.core.audio.mix_samples(&mut session.audio);
            for (pcm, sample) in session.pcm.iter_mut().zip(session.audio.iter()) {
                *pcm = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
            }
            env.set_int_array_region(&pixels, 0, &session.argb)?;
            env.set_short_array_region(&audio, 0, &session.pcm)?;
            Ok(u8::from(session.core.is_running()))
        })
    })
}

#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_key(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
    code: jint,
) {
    guarded(&mut env, |_| {
        with_session(id, |session| {
            if code < 0 {
                session.core.key_up();
            } else {
                session.core.key_down(
                    BbkKey::from_code(code as u8)
                        .filter(|_| code <= 0x3b)
                        .ok_or_else(|| anyhow!("无效按键"))?,
                );
            }
            Ok(())
        })
    });
}

#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_destroy(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
) {
    guarded(&mut env, |_| {
        // 即使此前 panic 使锁中毒，释放仍能回收会话，避免资源永久残留。
        let mut entries = sessions().lock().unwrap_or_else(|error| error.into_inner());
        entries.remove(&id);
        sessions().clear_poison();
        Ok(())
    });
}

#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_exportState(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
    kind: jint,
) -> jbyteArray {
    guarded(&mut env, |env| {
        with_session(id, |session| {
            let bytes = match kind {
                0 => session.core.cpu.memory().flash[..SRAM_LENGTH].to_vec(),
                1 => bincode::DefaultOptions::new()
                    .with_fixint_encoding()
                    .with_limit(MAX_STATE)
                    .serialize(&Snapshot {
                        magic: *b"BBKS0001",
                        identity: session.identity.clone(),
                        state: session.core.save_state(),
                    })?,
                _ => return Err(anyhow!("未知存档类型")),
            };
            Ok(env.byte_array_from_slice(&bytes)?.into_raw())
        })
    })
}

#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_importState(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
    kind: jint,
    data: JByteArray,
) {
    guarded(&mut env, |env| {
        ensure!(env.get_array_length(&data)? as u64 <= MAX_STATE, "存档过大");
        let bytes = env.convert_byte_array(&data)?;
        with_session(id, |session| {
            match kind {
                0 => {
                    ensure!(bytes.len() == SRAM_LENGTH, "原机存档长度错误");
                    session.core.cpu.memory_mut().flash[..SRAM_LENGTH].copy_from_slice(&bytes);
                }
                1 => {
                    let state: Snapshot = bincode::DefaultOptions::new()
                        .with_fixint_encoding()
                        .with_limit(MAX_STATE)
                        .deserialize(&bytes)?;
                    ensure!(
                        state.magic == *b"BBKS0001" && state.identity == session.identity,
                        "快照与当前游戏、ROM 或机型不匹配"
                    );
                    session.core.load_save_state(&state.state)?;
                    session.search = None;
                }
                _ => return Err(anyhow!("未知存档类型")),
            }
            Ok(())
        })
    });
}

fn number(request: &Value, key: &str) -> Result<u64> {
    request[key]
        .as_u64()
        .ok_or_else(|| anyhow!("缺少有效数字: {key}"))
}

fn read_value(bytes: &[u8], index: usize, width: usize) -> u32 {
    let mut result = [0u8; 4];
    result[..width].copy_from_slice(&bytes[index..index + width]);
    u32::from_le_bytes(result)
}

/// Flash 搜索与作弊写入使用同一物理地址视图，避免尾部旋转造成搜索与写入不一致。
fn memory_view(session: &Session, space: &str) -> Result<Vec<u8>> {
    match space {
        "ram" => Ok(session.core.cpu.memory().ram.clone()),
        "flash" => Ok((0x200000..0x400000)
            .map(|address| session.core.cpu.memory().read_physical(address))
            .collect()),
        _ => Err(anyhow!("未知内存空间")),
    }
}

fn search(session: &mut Session, request: &Value) -> Result<Value> {
    let space = request["space"].as_str().unwrap_or("ram");
    let width = usize::try_from(number(request, "width")?)?;
    ensure!([1, 2, 4].contains(&width), "搜索宽度必须为 1、2 或 4 字节");
    let mode = request["mode"].as_str().unwrap_or("equal");
    ensure!(
        [
            "initial",
            "equal",
            "changed",
            "unchanged",
            "increased",
            "decreased"
        ]
        .contains(&mode),
        "未知筛选条件"
    );
    let current = memory_view(session, space)?;
    let reset = request["reset"].as_bool().unwrap_or(false);
    if reset || session.search.is_none() {
        session.search = Some(Search {
            space: space.to_owned(),
            width,
            previous: current.clone(),
            candidates: (0..=current.len() - width).collect(),
        });
    }
    let previous = session
        .search
        .as_mut()
        .ok_or_else(|| anyhow!("请先开始搜索"))?;
    ensure!(
        previous.space == space && previous.width == width,
        "内存范围或宽度已改变，请重新搜索"
    );
    let expected = if mode == "equal" {
        Some(number(request, "value")?)
    } else {
        None
    };
    if let Some(value) = expected {
        ensure!(
            value <= u32::MAX as u64 && (width == 4 || value < (1u64 << (width * 8))),
            "数值超出所选字节宽度"
        );
    }
    previous.candidates.retain(|index| {
        let now = read_value(&current, *index, width);
        let before = read_value(&previous.previous, *index, width);
        match mode {
            "equal" => Some(now as u64) == expected,
            "changed" => now != before,
            "unchanged" => now == before,
            "increased" => now > before,
            "decreased" => now < before,
            _ => true,
        }
    });
    let base = if space == "flash" { 0x200000 } else { 0 };
    let values: Vec<Value> = previous
        .candidates
        .iter()
        .take(100)
        .map(|index| json!({"address": index + base, "value": read_value(&current, *index, width)}))
        .collect();
    previous.previous = current;
    Ok(json!({"total": previous.candidates.len(), "results": values}))
}

fn command(session: &mut Session, request: Value) -> Result<Value> {
    match request["op"].as_str().ok_or_else(|| anyhow!("缺少操作"))? {
        "speed" => {
            let value = number(&request, "value")?;
            ensure!([1, 2, 3, 4, 6, 8].contains(&value), "无效倍率");
            // 帧内 CPU 周期增加时硬件计时器已经随周期推进，不能再乘倍率形成平方加速。
            session.core.set_cpu_rate(value as f32);
            session.core.set_timer_rate(1.0);
            Ok(json!({"speed": value}))
        }
        "search" => search(session, &request),
        "write" => {
            ensure!(session.core.cheat.cheats().len() < 1024, "作弊条目过多");
            let address = number(&request, "address")?;
            let width = usize::try_from(number(&request, "width")?)?;
            let value = number(&request, "value")?;
            ensure!(
                address <= 0xffffff && [1, 2, 4].contains(&width),
                "地址或字节宽度无效"
            );
            ensure!(
                value <= u32::MAX as u64 && (width == 4 || value < (1u64 << (width * 8))),
                "数值越界"
            );
            let code = format!("{address:06X}:{value:0width$X}", width = width * 2);
            let id = session
                .core
                .cheat
                .add_cheat(&code)
                .ok_or_else(|| anyhow!("地址越界或指向只读 ROM"))?;
            let (ram, flash) = session.core.cpu.memory_mut().get_ram_and_flash();
            session.core.cheat.apply_cheats(ram, flash);
            if !request["lock"].as_bool().unwrap_or(false) {
                session.core.cheat.remove_cheat(id);
            }
            Ok(json!({"id": id, "code": code}))
        }
        "cheatAdd" => {
            ensure!(session.core.cheat.cheats().len() < 1024, "作弊条目过多");
            let code = request["code"]
                .as_str()
                .ok_or_else(|| anyhow!("缺少作弊码"))?;
            let id = session
                .core
                .cheat
                .add_cheat(code)
                .ok_or_else(|| anyhow!("作弊码格式或地址无效"))?;
            session
                .core
                .cheat
                .set_cheat_enabled(id, request["enabled"].as_bool().unwrap_or(true));
            Ok(json!({"id": id}))
        }
        "cheatImport" => {
            let codes = request["codes"]
                .as_array()
                .ok_or_else(|| anyhow!("缺少作弊码列表"))?;
            ensure!(
                !codes.is_empty() && session.core.cheat.cheats().len() + codes.len() <= 1024,
                "作弊码数量无效"
            );
            // 先在独立引擎中验证全部代码，任一无效时不修改已有作弊配置。
            let mut validation = bbkemu_core::cheat::CheatEngine::new();
            for code in codes {
                ensure!(
                    validation
                        .add_cheat(code.as_str().ok_or_else(|| anyhow!("作弊码必须为文本"))?)
                        .is_some(),
                    "存在格式错误或越界的作弊码"
                );
            }
            for code in codes {
                session
                    .core
                    .cheat
                    .add_cheat(code.as_str().ok_or_else(|| anyhow!("作弊码必须为文本"))?)
                    .ok_or_else(|| anyhow!("作弊标识已耗尽"))?;
            }
            Ok(json!({"imported": codes.len()}))
        }
        "cheatToggle" => {
            let id = u32::try_from(number(&request, "id")?)?;
            ensure!(
                session.core.cheat.set_cheat_enabled(
                    id,
                    request["enabled"]
                        .as_bool()
                        .ok_or_else(|| anyhow!("缺少开关状态"))?
                ),
                "作弊条目不存在"
            );
            Ok(json!({}))
        }
        "cheatRemove" => {
            let id = u32::try_from(number(&request, "id")?)?;
            ensure!(session.core.cheat.remove_cheat(id), "作弊条目不存在");
            Ok(json!({}))
        }
        "cheatList" => Ok(
            json!({"cheats": session.core.cheat.cheats().iter().map(|(id, code)| json!({"id": id, "code": code.description, "enabled": code.enabled})).collect::<Vec<_>>()}),
        ),
        _ => Err(anyhow!("不支持的操作")),
    }
}

/// 用户输入错误返回结构化消息，内部 panic 才终止会话；不让格式错误引起应用崩溃。
#[no_mangle]
pub extern "system" fn Java_com_xiongjian_bbkclassics_BbkNative_command(
    mut env: JNIEnv,
    _this: JObject,
    id: jlong,
    request: JString,
) -> jstring {
    guarded(&mut env, |env| {
        let request: String = env.get_string(&request)?.into();
        ensure!(request.len() < 65536, "命令过大");
        let result = serde_json::from_str::<Value>(&request)
            .map_err(anyhow::Error::from)
            .and_then(|request| with_session(id, |session| command(session, request)));
        let response = match result {
            Ok(value) => json!({"ok": true, "data": value}),
            Err(error) => json!({"ok": false, "message": error.to_string()}),
        };
        Ok(env.new_string(response.to_string())?.into_raw())
    })
}
