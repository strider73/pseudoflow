#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use std::fs;
use std::sync::{Mutex, OnceLock};

// Files handed to the app by the OS (double-click, "Open With") wait here
// until the web view asks for them, so none are lost during startup
static OPENED_FILES: Mutex<Vec<String>> = Mutex::new(Vec::new());
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let _ = APP_HANDLE.set(app.handle());
      #[cfg(target_os = "macos")]
      macos_open_files::install();
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![save_file, take_opened_files])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn save_file(path: String, contents: String) {
  fs::write(path, contents).unwrap();
}

#[tauri::command]
fn take_opened_files() -> Vec<String> {
  std::mem::take(&mut *OPENED_FILES.lock().unwrap())
}

fn queue_opened_files(paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  OPENED_FILES.lock().unwrap().extend(paths);
  if let Some(handle) = APP_HANDLE.get() {
    use tauri::Manager;
    let _ = handle.emit_all("opened-files", ());
  }
}

// Tauri 1 does not forward macOS "open document" requests, so the handler is
// added to tao's app delegate class before the app finishes launching
#[cfg(target_os = "macos")]
mod macos_open_files {
  use objc::runtime::{class_addMethod, Class, Object, Sel};
  use objc::{msg_send, sel, sel_impl};
  use std::ffi::CStr;
  use std::os::raw::c_char;

  type Id = *mut Object;

  extern "C" fn application_open_files(_this: &Object, _sel: Sel, app: Id, files: Id) {
    unsafe {
      let count: usize = msg_send![files, count];
      let mut paths = Vec::with_capacity(count);
      for i in 0..count {
        let path: Id = msg_send![files, objectAtIndex: i];
        let utf8: *const c_char = msg_send![path, UTF8String];
        if !utf8.is_null() {
          paths.push(CStr::from_ptr(utf8).to_string_lossy().into_owned());
        }
      }
      super::queue_opened_files(paths);
      // NSApplicationDelegateReplySuccess
      let _: () = msg_send![app, replyToOpenOrPrint: 0usize];
    }
  }

  pub fn install() {
    if let Some(class) = Class::get("TaoAppDelegate") {
      unsafe {
        let imp: extern "C" fn(&Object, Sel, Id, Id) = application_open_files;
        class_addMethod(
          class as *const Class as *mut Class,
          sel!(application:openFiles:),
          std::mem::transmute(imp),
          b"v@:@@\0".as_ptr() as *const c_char,
        );

        // AppKit caches what the delegate responds to, so attach it again
        let ns_app: Id = msg_send![Class::get("NSApplication").unwrap(), sharedApplication];
        let delegate: Id = msg_send![ns_app, delegate];
        let nil: Id = std::ptr::null_mut();
        let _: () = msg_send![ns_app, setDelegate: nil];
        let _: () = msg_send![ns_app, setDelegate: delegate];
      }
    }
  }
}
