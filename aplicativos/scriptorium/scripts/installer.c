#define UNICODE
#define _UNICODE
#include <windows.h>
#include <string.h>
#include <wchar.h>

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR arguments, int show) {
    (void)instance; (void)previous; (void)arguments; (void)show;
    wchar_t directory[32768], powershell[32768], script[32768], command[65536];
    DWORD length = GetModuleFileNameW(NULL, directory, 32768);
    if (!length || length >= 32768) goto failed;
    wchar_t *separator = wcsrchr(directory, L'\\');
    if (!separator) goto failed;
    *separator = 0;
    UINT systemLength = GetSystemDirectoryW(powershell, 32768);
    if (!systemLength || systemLength >= 32768) goto failed;
    const wchar_t *quiet = strstr(arguments, "--quiet") ? L" -Quiet" : L"";
    if (swprintf(script, 32768, L"%ls\\Instalar-Scriptorium.ps1", directory) < 0 ||
        swprintf(powershell + systemLength, 32768 - systemLength,
                 L"\\WindowsPowerShell\\v1.0\\powershell.exe") < 0 ||
        swprintf(command, 65536, L"\"%ls\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%ls\"%ls",
                 powershell, script, quiet) < 0) goto failed;
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    startup.cb = sizeof(startup);
    if (!CreateProcessW(powershell, command, NULL, NULL, FALSE, CREATE_NO_WINDOW,
                        NULL, directory, &startup, &process)) goto failed;
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD exitCode = 1;
    GetExitCodeProcess(process.hProcess, &exitCode);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return (int)exitCode;
failed:
    MessageBoxW(NULL, L"Não foi possível iniciar a instalação. Extraia o pacote completo e tente novamente.",
                L"Scriptorium", MB_OK | MB_ICONERROR);
    return 1;
}
