#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod gesture;
mod panel;
#[cfg(windows)]
mod windows;

use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    fs::{self, File},
    io::Read,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, DragDropEvent, Emitter, Manager, PhysicalPosition, State, WebviewWindow, Window,
    WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt as _;
use tauri_plugin_notification::{Action, ActionType, NotificationExt as _};

#[derive(Default)]
struct Desktop {
    serial: AtomicU64,
    conversions: AtomicU32,
    browser_pid: AtomicU32,
    recycle: AtomicBool,
    offer: AtomicBool,
    processing: AtomicBool,
    inputs: Mutex<BTreeMap<u64, Input>>,
    dragging: Mutex<BTreeMap<String, u64>>,
    history: Mutex<VecDeque<History>>,
    converting: Mutex<HashSet<String>>,
    folder: Mutex<Option<PathBuf>>,
}

struct Input {
    window: String,
    paths: Vec<PathBuf>,
}
#[derive(Clone, Serialize)]
struct Entry {
    name: String,
    size: u64,
}

#[derive(Clone, Serialize)]
struct Offer {
    id: Option<u64>,
    entries: Vec<Entry>,
    x: f64,
    y: f64,
    problem: Option<&'static str>,
}
#[derive(Clone, Serialize, Deserialize)]
struct History {
    id: u64,
    name: String,
    path: PathBuf,
}

fn record(
    app: &AppHandle,
    label: &str,
    paths: &[PathBuf],
    position: PhysicalPosition<f64>,
    previous: Option<u64>,
) -> Offer {
    let mut entries = Vec::new();
    let mut size = 0u64;
    let mut problem = paths.is_empty().then_some("type");
    for path in paths.iter().take(256) {
        let Ok(meta) = path.metadata() else {
            problem = Some("damaged");
            break;
        };
        if !meta.is_file() {
            problem = Some("type");
            break;
        }
        if meta.len() == 0 {
            problem = Some("empty");
            break;
        }
        size = size.saturating_add(meta.len());
        entries.push(Entry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            size: meta.len(),
        });
    }
    if size > files::MAX_BYTES || paths.len() > 256 {
        problem = Some("large");
    }
    let id = if problem.is_none() {
        let state = app.state::<Desktop>();
        let mut inputs = state.inputs.lock().expect("input lock");
        previous
            .filter(|id| {
                inputs
                    .get(id)
                    .is_some_and(|input| input.window == label && input.paths == paths)
            })
            .or_else(|| {
                let id = state.serial.fetch_add(1, Ordering::Relaxed) + 1;
                while inputs.len() >= 6 {
                    inputs.pop_first();
                }
                inputs.insert(
                    id,
                    Input {
                        window: label.to_owned(),
                        paths: paths.to_vec(),
                    },
                );
                Some(id)
            })
    } else {
        None
    };
    Offer {
        id,
        entries,
        x: position.x,
        y: position.y,
        problem,
    }
}

fn window_drag(window: &Window, event: &DragDropEvent) {
    let app = window.app_handle();
    let label = window.label();
    let state = app.state::<Desktop>();
    match event {
        DragDropEvent::Enter { paths, position } => {
            if label == "gesture" {
                state.offer.store(true, Ordering::Relaxed);
            }
            #[cfg(windows)]
            let position = windows::drag_enter_client_position(window, *position);
            #[cfg(not(windows))]
            let position = *position;
            let offer = record(app, label, paths, position, None);
            let mut dragging = state.dragging.lock().expect("drag lock");
            dragging.remove(label);
            if let Some(id) = offer.id {
                dragging.insert(label.to_owned(), id);
            }
            drop(dragging);
            let _ = app.emit_to(label, "versa-drag-enter", offer);
        }
        DragDropEvent::Over { position } => {
            let _ = app.emit_to(label, "versa-drag-over", (position.x, position.y));
        }
        DragDropEvent::Drop { paths, position } => {
            if label == "gesture" {
                state.processing.store(true, Ordering::Relaxed);
            }
            let previous = state.dragging.lock().expect("drag lock").remove(label);
            let offer = record(app, label, paths, *position, previous);
            let _ = app.emit_to(label, "versa-drag-drop", offer);
        }
        DragDropEvent::Leave => {
            state.dragging.lock().expect("drag lock").remove(label);
            let _ = app.emit_to(label, "versa-drag-leave", ());
        }
        _ => {}
    }
}

fn input_paths(state: &Desktop, label: &str, id: u64) -> Result<Vec<PathBuf>, String> {
    state
        .inputs
        .lock()
        .map_err(|error| error.to_string())?
        .get(&id)
        .filter(|input| input.window == label)
        .map(|input| input.paths.clone())
        .ok_or_else(|| "Choose the source files again.".into())
}

#[tauri::command]
async fn pick(app: AppHandle, window: WebviewWindow) -> Result<Option<Offer>, String> {
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let selection = app
            .dialog()
            .file()
            .add_filter(
                "Versa",
                &[
                    "pdf", "docx", "xlsx", "pptx", "jpg", "jpeg", "png", "webp", "avif",
                ],
            )
            .blocking_pick_files();
        Ok(selection.map(|selection| {
            let paths: Vec<_> = selection
                .into_iter()
                .filter_map(|file| file.into_path().ok())
                .collect();
            record(&app, &label, &paths, PhysicalPosition::default(), None)
        }))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_file(
    app: AppHandle,
    window: WebviewWindow,
    id: u64,
    index: usize,
) -> Result<Response, String> {
    let paths = input_paths(&app.state::<Desktop>(), window.label(), id)?;
    let path = paths
        .get(index)
        .cloned()
        .ok_or_else(|| "File unavailable.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let input = File::open(path).map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        input
            .take(files::MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() as u64 > files::MAX_BYTES {
            return Err("File too large.".into());
        }
        Ok(Response::new(bytes))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn raw<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    if let InvokeBody::Raw(bytes) = request.body() {
        Ok(bytes.as_slice())
    } else {
        Err("Invalid data.".into())
    }
}
fn split_payload(payload: &[u8]) -> Result<(&[u8], &[u8]), String> {
    let separator = payload
        .iter()
        .take(1024)
        .position(|byte| *byte == b'\n')
        .ok_or("Missing operation header.")?;
    Ok((&payload[..separator], &payload[separator + 1..]))
}

#[tauri::command]
async fn save_editor_pdf(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<bool, String> {
    use std::io::Write;
    if window.label() != "main" {
        return Err("PDF editing requires the main window.".into());
    }
    let (header, data) = split_payload(raw(&request)?)?;
    let name: String = serde_json::from_slice(header).map_err(|error| error.to_string())?;
    let (label, extension) = if data.starts_with(b"%PDF-") {
        ("PDF", "pdf")
    } else if data.starts_with(b"PK\x03\x04") && name.ends_with(".zip") {
        ("ZIP", "zip")
    } else {
        return Err("Invalid editor output.".into());
    };
    if data.len() as u64 > files::MAX_BYTES * 3 {
        return Err("Editor output exceeds the size limit.".into());
    }
    let suggestion = std::path::Path::new(&name)
        .file_name()
        .ok_or("Invalid filename.")?
        .to_string_lossy()
        .into_owned();
    let bytes = data.to_vec();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_file_name(suggestion)
            .add_filter(label, &[extension])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let mut path = path.into_path().map_err(|error| error.to_string())?;
        if !path
            .extension()
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
        {
            path.set_extension(extension);
        }
        let folder = path.parent().ok_or("Output folder unavailable.")?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(folder).map_err(|error| error.to_string())?;
        temporary
            .write_all(&bytes)
            .map_err(|error| error.to_string())?;
        temporary
            .persist_noclobber(path)
            .map_err(|error| error.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Deserialize)]
struct SaveRequest {
    id: u64,
    extension: String,
    english: bool,
}

fn state_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let directory = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&directory).ok()?;
    Some(directory.join(name))
}

fn write_settings(app: &AppHandle, name: &str, value: &impl Serialize) {
    if let (Some(path), Ok(bytes)) = (state_file(app, name), serde_json::to_vec(value)) {
        if let Some(directory) = path.parent() {
            if let Ok(mut temporary) = tempfile::NamedTempFile::new_in(directory) {
                use std::io::Write as _;
                if temporary.write_all(&bytes).is_ok() {
                    let _ = temporary.persist(path);
                }
            }
        }
    }
}

#[tauri::command]
async fn save_result(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<History, String> {
    let (header, bytes) = split_payload(raw(&request)?)?;
    let args: SaveRequest = serde_json::from_slice(header).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > files::MAX_BYTES * 3 {
        return Err("Output too large.".into());
    }
    let bytes = bytes.to_vec();
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || persist(&app, &label, args, &bytes))
        .await
        .map_err(|error| error.to_string())?
}

fn persist(
    app: &AppHandle,
    label: &str,
    args: SaveRequest,
    bytes: &[u8],
) -> Result<History, String> {
    let state = app.state::<Desktop>();
    let paths = input_paths(&state, label, args.id)?;
    let source = paths.first().ok_or("Choose source files first.")?;
    let folder = state
        .folder
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let directory = folder
        .as_deref()
        .or_else(|| source.parent())
        .ok_or("Output folder unavailable.")?;
    let path = files::save_unique(
        directory,
        source.file_stem().ok_or("Invalid filename.")?,
        &args.extension,
        bytes,
    )?;
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let id = state.serial.fetch_add(1, Ordering::Relaxed) + 1;
    let result = History { id, name, path };
    {
        let mut history = state.history.lock().map_err(|error| error.to_string())?;
        history.push_front(result.clone());
        history.truncate(20);
        write_settings(app, "history.json", &*history);
    }

    let (title, open, reveal) = if args.english {
        ("Done", "Open", "Show in folder")
    } else {
        ("Feito", "Abrir", "Mostrar na pasta")
    };
    let actions = ActionType::builder(format!("versa-result-{id}"))
        .actions(vec![
            Action::builder(format!("open-{id}"), open).build(),
            Action::builder(format!("reveal-{id}"), reveal).build(),
        ])
        .build();
    let identifier = actions.id().to_owned();
    let _ = app.notification().register_action_types(vec![actions]);
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(&result.name)
        .action_type_id(identifier)
        .show();
    let count = state.conversions.fetch_add(1, Ordering::Relaxed) + 1;
    #[cfg(windows)]
    let memory = windows::working_set(state.browser_pid.load(Ordering::Relaxed));
    #[cfg(not(windows))]
    let memory = 0usize;
    if count >= 40 || memory > 1024 * 1024 * 1024 {
        state.recycle.store(true, Ordering::Relaxed);
    }
    let _ = app.emit("versa-history", ());
    Ok(result)
}

#[tauri::command]
async fn office_pdf(request: Request<'_>) -> Result<Response, String> {
    let (kind, bytes) = split_payload(raw(&request)?)?;
    if bytes.len() as u64 > files::MAX_BYTES {
        return Err("Office file too large.".into());
    }
    let kind = std::str::from_utf8(kind)
        .map_err(|error| error.to_string())?
        .to_owned();
    let bytes = bytes.to_vec();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let result = windows::office_pdf(&kind, &bytes);
        #[cfg(not(windows))]
        let result: Option<Vec<u8>> = {
            let _ = (kind, bytes);
            None
        };
        Ok(Response::new(result.unwrap_or_default()))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn history(state: State<'_, Desktop>) -> Vec<History> {
    state
        .history
        .lock()
        .expect("history lock")
        .iter()
        .cloned()
        .collect()
}

fn open_history(state: &Desktop, id: u64, reveal: bool) -> Result<(), String> {
    let path = state
        .history
        .lock()
        .map_err(|error| error.to_string())?
        .iter()
        .find(|entry| entry.id == id)
        .map(|entry| entry.path.clone())
        .ok_or("Output unavailable.")?;
    if !path.is_file() {
        return Err("Output unavailable.".into());
    }
    #[cfg(windows)]
    return windows::open_output(&path, reveal);
    #[cfg(not(windows))]
    {
        let _ = reveal;
        Err("Windows only.".into())
    }
}

#[tauri::command]
fn open_result(state: State<'_, Desktop>, id: u64, reveal: bool) -> Result<(), String> {
    open_history(&state, id, reveal)
}

#[tauri::command]
fn startup(app: AppHandle, enabled: Option<bool>) -> Result<bool, String> {
    let manager = app.autolaunch();
    if let Some(enabled) = enabled {
        if enabled {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(|error| error.to_string())?;
    }
    manager.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
async fn output_folder(app: AppHandle, change: Option<bool>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Desktop>();
        if let Some(change) = change {
            let next = if change {
                app.dialog()
                    .file()
                    .blocking_pick_folder()
                    .and_then(|path| path.into_path().ok())
            } else {
                None
            };
            if next.is_some() || !change {
                let mut folder = state.folder.lock().map_err(|error| error.to_string())?;
                *folder = next;
                write_settings(&app, "folder.json", &*folder);
            }
        }
        let folder = state
            .folder
            .lock()
            .expect("folder lock")
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned());
        Ok(folder)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn hide_window(app: &AppHandle, window: &WebviewWindow) {
    let state = app.state::<Desktop>();
    if window.label() == "gesture" {
        state.processing.store(false, Ordering::Relaxed);
        state.offer.store(false, Ordering::Relaxed);
    }
    let _ = window.hide();
    if state.converting.lock().expect("conversion lock").is_empty()
        && state.recycle.swap(false, Ordering::Relaxed)
    {
        write_settings(app, "recycling.json", &true);
        app.request_restart();
    }
}

#[tauri::command]
fn hide(app: AppHandle, window: WebviewWindow) {
    hide_window(&app, &window);
}

#[tauri::command]
fn conversion_activity(app: AppHandle, window: WebviewWindow, active: bool) {
    let state = app.state::<Desktop>();
    let mut conversions = state.converting.lock().expect("conversion lock");
    if active {
        conversions.insert(window.label().to_owned());
    } else {
        conversions.remove(window.label());
    }
}

#[tauri::command]
fn idle(app: AppHandle, window: WebviewWindow) {
    if app.state::<Desktop>().recycle.load(Ordering::Relaxed) {
        hide_window(&app, &window);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn load_desktop(app: &AppHandle) {
    let state = app.state::<Desktop>();
    if let Some(history) = state_file(app, "history.json")
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<VecDeque<History>>(&bytes).ok())
    {
        state.serial.store(
            history.iter().map(|entry| entry.id).max().unwrap_or(0),
            Ordering::Relaxed,
        );
        *state.history.lock().expect("history lock") = history;
    }
    if let Some(folder) = state_file(app, "folder.json")
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<Option<PathBuf>>(&bytes).ok())
    {
        *state.folder.lock().expect("folder lock") = folder.filter(|path| path.is_dir());
    }
}

fn main() {
    #[cfg(windows)]
    if windows::reject_administrator() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .manage(Desktop::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--background"])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(panel::state_plugin())
        .invoke_handler(tauri::generate_handler![
            pick,
            read_file,
            save_result,
            save_editor_pdf,
            office_pdf,
            history,
            open_result,
            startup,
            output_folder,
            hide,
            idle,
            conversion_activity
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            load_desktop(&handle);
            if let Some(window) = handle.get_webview_window("main") {
                panel::place(&window);
            }
            let actions = handle.clone();
            app.notification().on_action(move |action| {
                if let Some((verb, id)) = action.action_id().split_once('-') {
                    if let Ok(id) = id.parse() {
                        let _ = open_history(&actions.state::<Desktop>(), id, verb == "reveal");
                    }
                } else {
                    show_main(&actions);
                }
            })?;
            let open = MenuItem::with_id(app, "open", "Abrir Versa", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "quit", "Sair / Quit", true, None::<&str>)?;
            let tray = TrayIconBuilder::new()
                .tooltip("Versa")
                .menu(&Menu::with_items(app, &[&open, &exit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            let tray = if let Some(icon) = app.default_window_icon() {
                tray.icon(icon.clone())
            } else {
                tray
            };
            tray.build(app)?;
            let recycled = state_file(&handle, "recycling.json")
                .is_some_and(|path| fs::remove_file(path).is_ok());
            if !recycled && !std::env::args().any(|arg| arg == "--background") {
                show_main(&handle);
            }
            #[cfg(windows)]
            {
                if let Some(window) = handle.get_webview_window("gesture") {
                    let browser = handle.clone();
                    let _ = window.with_webview(move |webview| {
                        if let Ok(controller) = unsafe { webview.controller().CoreWebView2() } {
                            let mut pid = 0;
                            if unsafe { controller.BrowserProcessId(&mut pid) }.is_ok() {
                                browser
                                    .state::<Desktop>()
                                    .browser_pid
                                    .store(pid, Ordering::Relaxed);
                            }
                        }
                    });
                }
                windows::poll(handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    hide_window(window.app_handle(), &webview);
                }
            }
            // Tauri dispatches native drops on a full-window webview as window events.
            WindowEvent::DragDrop(event) => window_drag(window, event),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Versa could not start");
}
