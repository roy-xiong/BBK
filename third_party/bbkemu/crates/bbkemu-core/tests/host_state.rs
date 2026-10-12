//! 不依赖游戏 ROM 的恢复回归，验证 CPU 和硬件状态不会只恢复 PC/SP。

use bbkemu_core::{model, Emulator};

#[test]
fn restore_includes_cpu_banks_timers_and_flash() {
    let mut core = Emulator::new(&model::MODEL_4980);
    core.cpu.inner.registers.accumulator = 0x31;
    core.cpu.inner.registers.index_x = 0x42;
    core.cpu.inner.registers.index_y = 0x53;
    core.cpu.inner.cycles = 123456;
    core.cpu.set_pc(0x5123);
    core.cpu.set_sp(0xe7);
    core.cpu.inner.host_restore_execution_state(1, true);
    core.cpu.memory_mut().bank_switch.set(5, 0x234);
    core.cpu.memory_mut().bank_switch.set_selected(5);
    core.cpu
        .memory_mut()
        .host_restore_timer_counters([1, 2, 3, 4, 5]);
    core.cpu.memory_mut().ram[0x3000] = 0x71;
    core.cpu.memory_mut().flash[0x100000] = 0x81;
    let saved = core.save_state();
    let mut restored = Emulator::new(&model::MODEL_4980);
    restored.load_save_state(&saved).unwrap();
    assert_eq!(restored.cpu.a(), 0x31);
    assert_eq!(restored.cpu.x(), 0x42);
    assert_eq!(restored.cpu.y(), 0x53);
    assert_eq!(restored.cpu.pc(), 0x5123);
    assert_eq!(restored.cpu.sp(), 0xe7);
    assert_eq!(restored.cpu.cycles(), 123456);
    assert_eq!(restored.cpu.inner.host_execution_state(), (1, true));
    assert_eq!(restored.cpu.memory().bank_switch.banks[5], 0x234);
    assert_eq!(restored.cpu.memory().bank_switch.selected(), 5);
    assert_eq!(restored.cpu.memory().host_timer_counters(), [1, 2, 3, 4, 5]);
    assert_eq!(restored.cpu.memory().ram[0x3000], 0x71);
    assert_eq!(restored.cpu.memory().flash[0x100000], 0x81);
}

#[test]
fn wrong_model_and_corrupt_lengths_do_not_mutate_live_state() {
    let mut source = Emulator::new(&model::MODEL_4980).save_state();
    let mut target = Emulator::new(&model::MODEL_4988);
    target.cpu.memory_mut().ram[0x3000] = 0x7f;
    assert!(target.load_save_state(&source).is_err());
    assert_eq!(target.cpu.memory().ram[0x3000], 0x7f);
    source.bank_sys_d = model::MODEL_4988.bank_sys_d;
    source.ram.pop();
    assert!(target.load_save_state(&source).is_err());
    assert_eq!(target.cpu.memory().ram[0x3000], 0x7f);
}
