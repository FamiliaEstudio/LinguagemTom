#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wchar.h>

static HWND running_window(void) {
    HWND window = FindWindowW(NULL, L"Scriptorium");
    if (!window) return NULL;
    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return NULL;
    wchar_t filename[32768];
    DWORD length = 32768;
    BOOL found = QueryFullProcessImageNameW(process, 0, filename, &length);
    CloseHandle(process);
    if (!found) return NULL;
    const wchar_t *name = wcsrchr(filename, L'\\');
    return name && _wcsicmp(name + 1, L"scriptorium.exe") == 0 ? window : NULL;
}

static void activate(HWND window) {
    ShowWindow(window, SW_RESTORE);
    SetForegroundWindow(window);
    SwitchToThisWindow(window, TRUE);
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR arguments, int show) {
    (void)instance; (void)previous; (void)arguments; (void)show;
    HWND window = running_window();
    if (window) { activate(window); return 0; }

    wchar_t directory[32768], executable[32768];
    DWORD length = GetModuleFileNameW(NULL, directory, 32768);
    if (!length || length >= 32768) goto failed;
    wchar_t *separator = wcsrchr(directory, L'\\');
    if (!separator) goto failed;
    *separator = 0;
    if (swprintf(executable, 32768, L"%ls\\scriptorium.exe", directory) < 0) goto failed;
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    startup.cb = sizeof(startup);
    if (!CreateProcessW(executable, NULL, NULL, NULL, FALSE, 0, NULL, directory, &startup, &process)) goto failed;
    CloseHandle(process.hThread);
    for (int i = 0; i < 100; i++) {
        window = running_window();
        if (window) {
            DWORD pid = 0;
            GetWindowThreadProcessId(window, &pid);
            if (pid == process.dwProcessId) {
                activate(window);
                CloseHandle(process.hProcess);
                return 0;
            }
        }
        if (WaitForSingleObject(process.hProcess, 100) == WAIT_OBJECT_0) break;
    }
    CloseHandle(process.hProcess);
failed:
    MessageBoxW(NULL, L"O Scriptorium não abriu. Confirme que o pacote está completo e tente novamente.",
                L"Scriptorium", MB_OK | MB_ICONERROR);
    return 1;
}
