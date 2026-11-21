; Modern UI uses ^Font for body text and for its 12 pt, bold welcome and finish titles.
SetFont "Segoe UI" 9
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "172825"
InstallColors 172825 FFFFFF

!define MUI_CUSTOMFUNCTION_GUIINIT VersaHeaderColors
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.VersaHeaderColors

!macro VersaHeaderColors PREFIX
Function ${PREFIX}VersaHeaderColors
  ; Modern UI's header subtitle control. The header title keeps its bold font and ink.
  Push $0
  GetDlgItem $0 $HWNDPARENT 1038
  SetCtlColors $0 "434950" "${MUI_BGCOLOR}"
  Pop $0
FunctionEnd
!macroend
!insertmacro VersaHeaderColors ""
!insertmacro VersaHeaderColors "un."

; Tauri includes this file before declaring its Modern UI pages and loading MUI_LANGUAGE.
; Use the Windows language IDs here because LANG_PORTUGUESE and LANG_ENGLISH are defined later.
LangString VersaInstallerCaption 2070 "Instalação do Versa"
LangString VersaInstallerCaption 1033 "Versa Setup"
LangString VersaUninstallerCaption 2070 "Desinstalação do Versa"
LangString VersaUninstallerCaption 1033 "Versa Uninstall"
LangString VersaWelcomeTitle 2070 "Bem-vindo ao Versa"
LangString VersaWelcomeTitle 1033 "Welcome to Versa"
LangString VersaWelcomeText 2070 "Instala o Versa para converter documentos e imagens no teu computador. Os teus ficheiros nunca saem do dispositivo."
LangString VersaWelcomeText 1033 "Install Versa to convert documents and images on your computer. Your files never leave your device."
LangString VersaFinishTitle 2070 "O Versa está instalado"
LangString VersaFinishTitle 1033 "Versa is installed"
LangString VersaFinishText 2070 "Abre o Versa para começar a converter ficheiros."
LangString VersaFinishText 1033 "Open Versa to start converting files."
LangString VersaRunText 2070 "Abrir o Versa"
LangString VersaRunText 1033 "Open Versa"
LangString VersaUninstallText 2070 "O Versa será removido deste computador. Os teus documentos ficam guardados."
LangString VersaUninstallText 1033 "Versa will be removed from this computer. Your documents will stay where you saved them."

Caption "$(VersaInstallerCaption)"
UninstallCaption "$(VersaUninstallerCaption)"
!define MUI_WELCOMEPAGE_TITLE "$(VersaWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(VersaWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(VersaFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(VersaFinishText)"
!define MUI_FINISHPAGE_RUN_TEXT "$(VersaRunText)"
!define MUI_UNCONFIRMPAGE_TEXT_TOP "$(VersaUninstallText)"
