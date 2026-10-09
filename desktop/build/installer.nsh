; Extra NSIS steps for the CorePOS installer (included by electron-builder).

!macro customInstall
  ; Bundled PHP needs the Microsoft Visual C++ 2015-2022 runtime.
  ; The redistributable is idempotent: it exits quickly if already installed.
  ; (vc_redist.exe is the x64 or x86 one, matching this installer.)
  IfFileExists "$INSTDIR\resources\vc_redist.exe" 0 vcredist_done
    DetailPrint "Installing Microsoft Visual C++ runtime..."
    ExecWait '"$INSTDIR\resources\vc_redist.exe" /install /quiet /norestart'
    Delete "$INSTDIR\resources\vc_redist.exe"
  vcredist_done:
!macroend
