use std::{
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub const MAX_BYTES: u64 = 192 * 1024 * 1024;
const EXTENSIONS: &[&str] = &["pdf", "docx", "txt", "png", "jpg", "webp", "avif", "zip"];

pub fn save_unique(
    directory: &Path,
    stem: &OsStr,
    extension: &str,
    data: &[u8],
) -> Result<PathBuf, String> {
    if !EXTENSIONS.contains(&extension) || data.is_empty() || data.len() as u64 > MAX_BYTES * 3 {
        return Err("Invalid Versa output.".into());
    }
    for index in 1..=999 {
        let mut filename = stem.to_os_string();
        filename.push(if index == 1 {
            " (Versa)".to_owned()
        } else {
            format!(" (Versa {index})")
        });
        filename.push(format!(".{extension}"));
        let output = directory.join(filename);
        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&output)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(data).and_then(|_| file.sync_all()) {
                    drop(file);
                    let _ = fs::remove_file(&output);
                    return Err(error.to_string());
                }
                return Ok(output);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not find a free filename.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn preserves_original_and_never_overwrites_an_output() {
        let instant = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("versa-test-{instant}"));
        fs::create_dir(&path).unwrap();
        fs::write(path.join("ficha.pdf"), "original").unwrap();
        let stem = OsStr::new("ficha");
        let first = save_unique(&path, stem, "pdf", b"first").unwrap();
        let second = save_unique(&path, stem, "pdf", b"second").unwrap();
        assert_eq!(first.file_name().unwrap(), "ficha (Versa).pdf");
        assert_eq!(second.file_name().unwrap(), "ficha (Versa 2).pdf");
        assert_eq!(fs::read(path.join("ficha.pdf")).unwrap(), b"original");
        assert_eq!(fs::read(first).unwrap(), b"first");
        assert_eq!(fs::read(second).unwrap(), b"second");
        assert!(save_unique(&path, stem, "exe", b"no").is_err());
        fs::remove_dir_all(path).unwrap();
    }
}
