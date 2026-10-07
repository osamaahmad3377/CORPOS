; Extra NSIS steps for the CorePOS installer (included by electron-builder).

!macro customInstall
  ; Bundled PHP needs the Microsoft Visual C++ 2015-2022 runtime.
  ; The redistributable is idempotent: it exits quickly if already installed.
  IfFileExists "$INSTDIR\resources\vc_redist.x64.exe" 0 vcredist_done
    DetailPrint "Installing Microsoft Visual C++ runtime..."
    ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /install /quiet /norestart'
    Delete "$INSTDIR\resources\vc_redist.x64.exe"
  vcredist_done:
!macroend
