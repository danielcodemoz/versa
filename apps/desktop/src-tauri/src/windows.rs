use crate::gesture::{Sample, ShiftDrag};
use crate::Desktop;
use std::{
    ffi::OsStr,
    fs,
    mem::size_of,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, POINT},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    },
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_SHIFT},
        WindowsAndMessaging::{GetAncestor, GetClassNameW, GetCursorPos, WindowFromPoint, GA_ROOT},
    },
};

pub fn reject_administrator() -> bool {
    if unsafe { windows_sys::Win32::UI::Shell::IsUserAnAdmin() } == 0 {
        return false;
    }
    let title: Vec<u16> = "Versa\0".encode_utf16().collect();
    let text: Vec<u16> = "Abre o Versa sem privilégios de administrador.
Run Versa without administrator rights.\0"
        .encode_utf16()
        .collect();
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONWARNING,
        );
    }
    true
}

fn explorer_origin(window: HWND) -> bool {
    let root = unsafe { GetAncestor(window, GA_ROOT) };
    if root.is_null() {
        return false;
    }
    let mut chars = [0u16; 48];
    let length = unsafe { GetClassNameW(root, chars.as_mut_ptr(), chars.len() as i32) };
    matches!(
        String::from_utf16_lossy(&chars[..length.max(0) as usize]).as_str(),
        "CabinetWClass" | "ExploreWClass" | "Progman" | "WorkerW"
    )
}

pub fn poll(app: AppHandle) {
    thread::spawn(move || {
        let mut gesture = ShiftDrag::default();
        let mut pressed = false;
        let mut opened = None::<Instant>;
        let mut release = None::<Instant>;
        loop {
            let left = unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } < 0;
            let shift = unsafe { GetAsyncKeyState(VK_SHIFT as i32) } < 0;
            let mut position: POINT = unsafe { std::mem::zeroed() };
            let _ = unsafe { GetCursorPos(&mut position) };
            let state = app.state::<Desktop>();
            if gesture.update(Sample {
                left,
                shift,
                x: position.x,
                y: position.y,
                explorer: left && !pressed && explorer_origin(unsafe { WindowFromPoint(position) }),
            }) && !state.processing.load(Ordering::Relaxed)
            {
                opened = Some(Instant::now());
                release = None;
                state.offer.store(false, Ordering::Relaxed);
                if let Some(wheel) = app.get_webview_window("gesture") {
                    let app = app.clone();
                    let _ = wheel.clone().run_on_main_thread(move || {
                        let (mut x, mut y) = (position.x, position.y);
                        if let Ok(size) = wheel.outer_size() {
                            x -= size.width as i32 / 2;
                            y -= size.height as i32 / 2;
                            if let Ok(Some(monitor)) = wheel
                                .monitor_from_point(f64::from(position.x), f64::from(position.y))
                            {
                                let bounds = monitor.work_area();
                                x = x.clamp(
                                    bounds.position.x,
                                    (bounds.position.x + bounds.size.width as i32
                                        - size.width as i32)
                                        .max(bounds.position.x),
                                );
                                y = y.clamp(
                                    bounds.position.y,
                                    (bounds.position.y + bounds.size.height as i32
                                        - size.height as i32)
                                        .max(bounds.position.y),
                                );
                            }
                        }
                        let _ = app.emit_to("gesture", "versa-wake", ());
                        let _ = wheel.set_position(PhysicalPosition::new(x, y));
                        let _ = wheel.show();
                    });
                }
            }
            if opened.is_some() && !left && pressed {
                release = Some(Instant::now());
            }
            if state.processing.load(Ordering::Relaxed) {
                opened = None;
                release = None;
            }
            if release.is_some_and(|time| time.elapsed() > Duration::from_millis(440))
                || opened.is_some_and(|time| {
                    !state.offer.load(Ordering::Relaxed) && time.elapsed() > Duration::from_secs(2)
                })
            {
                if let Some(wheel) = app.get_webview_window("gesture") {
                    let _ = wheel.hide();
                }
                opened = None;
                release = None;
            }
            pressed = left;
            thread::sleep(Duration::from_millis(if left || opened.is_some() {
                21
            } else {
                55
            }));
        }
    });
}

pub fn open_output(path: &Path, reveal: bool) -> Result<(), String> {
    let mut command = if reveal {
        let mut command = Command::new("explorer.exe");
        let mut argument = OsStr::new("/select,").to_os_string();
        argument.push(path);
        command.arg(argument);
        command
    } else {
        // ShellExecuteW opens directly in the file's registered application.
        let wide: Vec<u16> = std::os::windows::ffi::OsStrExt::encode_wide(path.as_os_str())
            .chain(Some(0))
            .collect();
        let code = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                std::ptr::null(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        } as usize;
        return if code > 32 {
            Ok(())
        } else {
            Err("Windows could not open the result.".into())
        };
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn run_hidden(command: &mut Command, deadline: Duration) -> bool {
    let Ok(mut child) = command
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if start.elapsed() < deadline => thread::sleep(Duration::from_millis(200)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

pub fn office_pdf(recipe: &str, bytes: &[u8]) -> Option<Vec<u8>> {
    let extension = match recipe {
        "word-pdf" => "docx",
        "excel-pdf" => "xlsx",
        "slides-pdf" => "pptx",
        _ => return None,
    };
    let temp = tempfile::tempdir().ok()?;
    let input = temp.path().join(format!("source.{extension}"));
    let output = temp.path().join("source.pdf");
    fs::write(&input, bytes).ok()?;
    let powershell = PathBuf::from(std::env::var_os("SystemRoot")?)
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut office = Command::new(powershell);
    if run_hidden(
        office
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                include_str!("office.ps1"),
            ])
            .env("VERSA_OFFICE_INPUT", &input)
            .env("VERSA_OFFICE_OUTPUT", &output)
            .env("VERSA_OFFICE_KIND", recipe),
        Duration::from_secs(60),
    ) {
        if let Some(result) = read_pdf(&output) {
            return Some(result);
        }
    }
    let _ = fs::remove_file(&output);
    let executable = ["ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|directory| PathBuf::from(directory).join("LibreOffice/program/soffice.exe"))
        .find(|candidate| candidate.is_file())?;
    let profile = tauri::Url::from_directory_path(temp.path().join("profile")).ok()?;
    let mut libre = Command::new(executable);
    if run_hidden(
        libre
            .arg(format!("-env:UserInstallation={profile}"))
            .args([
                "--headless",
                "--norestore",
                "--convert-to",
                "pdf",
                "--outdir",
            ])
            .arg(temp.path())
            .arg(&input),
        Duration::from_secs(60),
    ) {
        read_pdf(&output)
    } else {
        None
    }
}

fn read_pdf(path: &Path) -> Option<Vec<u8>> {
    let metadata = path.metadata().ok()?;
    if metadata.len() > crate::files::MAX_BYTES * 3 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    bytes.starts_with(b"%PDF-").then_some(bytes)
}

pub fn working_set(browser_pid: u32) -> usize {
    let pid = std::process::id();
    let mut targets = vec![pid];
    if browser_pid != 0 {
        targets.push(browser_pid);
    }
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot != INVALID_HANDLE_VALUE {
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
            let mut processes = Vec::new();
            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);
            let mut index = 0;
            while index < targets.len() {
                let parent = targets[index];
                for &(process, owner) in &processes {
                    if owner == parent && !targets.contains(&process) {
                        targets.push(process);
                    }
                }
                index += 1;
            }
        }
        targets
            .into_iter()
            .map(|process| {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process);
                if handle.is_null() {
                    return 0;
                }
                let mut memory: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
                let ok = K32GetProcessMemoryInfo(
                    handle,
                    &mut memory,
                    size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                );
                CloseHandle(handle);
                if ok == 0 {
                    0
                } else {
                    memory.WorkingSetSize
                }
            })
            .sum()
    }
}
