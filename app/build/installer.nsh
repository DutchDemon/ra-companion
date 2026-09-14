!include "nsDialogs.nsh"

; Use electron-builder's assisted install-mode page.
; The user can choose a per-user install or an all-users install.
; All-users installs request elevation automatically.

; A normal assisted finish page with two user choices:
; - launch the app after installation (electron-builder standard)
; - create a desktop shortcut (our optional checkbox)
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  Var /GLOBAL RADesktopShortcutCheckbox
  Var /GLOBAL RADesktopShortcutState

  Function RACreateDesktopShortcut
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x1002, i 0, i 0, i 0)'
  FunctionEnd

  Function RAFinishPageShow
    ${ifNot} ${isUpdated}
      ${NSD_CreateCheckbox} 120u 110u 195u 10u "Create a desktop shortcut"
      Pop $RADesktopShortcutCheckbox
      ${NSD_SetState} $RADesktopShortcutCheckbox ${BST_UNCHECKED}
    ${endif}
  FunctionEnd

  Function RAFinishPageLeave
    ${ifNot} ${isUpdated}
      ${NSD_GetState} $RADesktopShortcutCheckbox $RADesktopShortcutState
      ${If} $RADesktopShortcutState == ${BST_CHECKED}
        Call RACreateDesktopShortcut
      ${EndIf}
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_SHOW RAFinishPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE RAFinishPageLeave
  !insertmacro MUI_PAGE_FINISH
!macroend
