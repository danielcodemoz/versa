use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Wry};
use tauri_plugin_window_state::{Builder, StateFlags, WindowExt};

const FLAGS: StateFlags = StateFlags::POSITION
    .union(StateFlags::SIZE)
    .union(StateFlags::MAXIMIZED);

pub fn state_plugin() -> tauri::plugin::TauriPlugin<Wry> {
    Builder::new()
        .with_state_flags(FLAGS)
        .with_filter(|label| label == "main")
        .skip_initial_state("main")
        .build()
}

fn docked(
    origin: PhysicalPosition<i32>,
    work_area: PhysicalSize<u32>,
    desired: PhysicalSize<u32>,
) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let size = PhysicalSize::new(
        desired.width.min(work_area.width),
        desired.height.min(work_area.height),
    );
    let position = PhysicalPosition::new(
        origin.x + (work_area.width - size.width) as i32,
        origin.y + ((work_area.height - size.height) / 2) as i32,
    );
    (position, size)
}

pub fn place(window: &WebviewWindow) {
    let config = window
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window.label());
    if let (Some(config), Ok(Some(monitor))) = (config, window.primary_monitor()) {
        let work_area = monitor.work_area();
        let desired =
            LogicalSize::new(config.width, config.height).to_physical(monitor.scale_factor());
        let (position, size) = docked(work_area.position, work_area.size, desired);
        let _ = window.set_position(position);
        let _ = window.set_size(size);
    }
    let _ = window.restore_state(FLAGS);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docks_against_the_scaled_work_area_with_vertical_centering() {
        let desired = LogicalSize::new(460., 640.).to_physical(1.25);
        let (position, size) = docked(
            PhysicalPosition::new(-1600, 40),
            PhysicalSize::new(1600, 900),
            desired,
        );
        assert_eq!(size, PhysicalSize::new(575, 800));
        assert_eq!(position, PhysicalPosition::new(-575, 90));
    }

    #[test]
    fn fits_the_default_panel_on_a_small_display() {
        let (position, size) = docked(
            PhysicalPosition::new(32, 0),
            PhysicalSize::new(720, 600),
            PhysicalSize::new(460, 640),
        );
        assert_eq!(size, PhysicalSize::new(460, 600));
        assert_eq!(position, PhysicalPosition::new(292, 0));
    }
}
