//! 按明确宽度修改模拟内存；多字节作弊作为一个整体开启、关闭和删除。

use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct CheatCode {
    pub address: u32,
    pub value: u8,
    pub extra_bytes: Vec<u8>,
    pub enabled: bool,
    pub description: String,
}

/// 有序表确定重叠地址的执行顺序，后添加的作弊最后生效。
pub struct CheatEngine {
    cheats: BTreeMap<u32, CheatCode>,
    next_id: u32,
}

impl Default for CheatEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl CheatEngine {
    pub fn new() -> Self {
        Self {
            cheats: BTreeMap::new(),
            next_id: 0,
        }
    }

    /// 支持 AAAAAAVV、AAAA VVVV，以及 AAAAAA:VV / VVVV / VVVVVVVV。
    /// 冒号格式明确宽度，不能先删除分隔符造成 16 位格式歧义。
    pub fn add_cheat(&mut self, code: &str) -> Option<u32> {
        let code = code.trim();
        if !code.is_ascii() {
            return None;
        }
        let (address, value, width) = if let Some((address, value)) = code.split_once(':') {
            (address.trim(), value.trim(), value.trim().len() / 2)
        } else if code.split_whitespace().count() == 2 {
            let mut parts = code.split_whitespace();
            (parts.next()?, parts.next()?, 2)
        } else if code.len() == 8 {
            (&code[..6], &code[6..], 1)
        } else {
            return None;
        };
        if !(1..=6).contains(&address.len())
            || ![1, 2, 4].contains(&width)
            || value.len() != width * 2
        {
            return None;
        }
        let address = u32::from_str_radix(address, 16).ok()?;
        let value = u32::from_str_radix(value, 16).ok()?;
        let end = address.checked_add(width as u32)?;
        if !(end <= 0x8000 || (address >= 0x200000 && end <= 0x400000)) {
            return None;
        }
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1)?;
        let bytes = value.to_le_bytes();
        self.cheats.insert(
            id,
            CheatCode {
                address,
                value: bytes[0],
                extra_bytes: bytes[1..width].to_vec(),
                enabled: true,
                description: format!("{address:06X}:{value:0width$X}", width = width * 2),
            },
        );
        Some(id)
    }

    pub fn remove_cheat(&mut self, id: u32) -> bool {
        self.cheats.remove(&id).is_some()
    }
    pub fn set_cheat_enabled(&mut self, id: u32, enabled: bool) -> bool {
        if let Some(cheat) = self.cheats.get_mut(&id) {
            cheat.enabled = enabled;
            true
        } else {
            false
        }
    }
    pub fn clear(&mut self) {
        self.cheats.clear();
    }

    /// RAM 使用物理地址；Flash 尾部 32KiB 按原机总线规则旋转到缓冲前部。
    pub fn apply_cheats(&self, ram: &mut [u8], flash: &mut [u8]) {
        for cheat in self.cheats.values().filter(|cheat| cheat.enabled) {
            for (offset, value) in std::iter::once(&cheat.value)
                .chain(cheat.extra_bytes.iter())
                .enumerate()
            {
                let address = cheat.address as usize + offset;
                if address < ram.len() {
                    ram[address] = *value;
                } else if (0x200000..0x400000).contains(&address) {
                    let index = address - 0x200000;
                    let index = if index >= 0x1f8000 {
                        (index + 0x8000) % 0x200000
                    } else {
                        index
                    };
                    if let Some(byte) = flash.get_mut(index) {
                        *byte = *value;
                    }
                }
            }
        }
    }

    pub fn cheats(&self) -> &BTreeMap<u32, CheatCode> {
        &self.cheats
    }
    pub fn get_cheat(&self, id: u32) -> Option<&CheatCode> {
        self.cheats.get(&id)
    }
    pub fn has_active_cheats(&self) -> bool {
        self.cheats.values().any(|cheat| cheat.enabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_16bit_code_is_one_atomic_cheat() {
        let mut engine = CheatEngine::new();
        let id = engine.add_cheat("1234 5678").unwrap();
        let mut ram = vec![0; 0x8000];
        let mut flash = vec![0; 0x200000];
        engine.apply_cheats(&mut ram, &mut flash);
        assert_eq!(&ram[0x1234..0x1236], &[0x78, 0x56]);
        engine.set_cheat_enabled(id, false);
        ram.fill(0);
        engine.apply_cheats(&mut ram, &mut flash);
        assert_eq!(&ram[0x1234..0x1236], &[0, 0]);
        assert!(engine.remove_cheat(id));
        assert!(engine.cheats().is_empty());
    }

    #[test]
    fn invalid_codes_are_rejected_without_panics_or_partial_writes() {
        let mut engine = CheatEngine::new();
        for code in [
            "中文0000",
            "007FFF:FFFF",
            "3FFFFF:FFFF",
            "80000001",
            "1234:FFFFF",
        ] {
            assert_eq!(engine.add_cheat(code), None);
        }
    }

    #[test]
    fn flash_cheats_follow_the_bus_save_area_mapping() {
        let mut engine = CheatEngine::new();
        engine.add_cheat("3F8000:1234").unwrap();
        let mut ram = vec![0; 0x8000];
        let mut flash = vec![0; 0x200000];
        engine.apply_cheats(&mut ram, &mut flash);
        assert_eq!(&flash[..2], &[0x34, 0x12]);
    }
}
