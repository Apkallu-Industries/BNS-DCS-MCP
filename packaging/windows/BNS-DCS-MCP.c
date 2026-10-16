#define UNICODE
#define _UNICODE
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

static int file_exists(const wchar_t *path) {
    DWORD attrs = GetFileAttributesW(path);
    return attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY);
}

static void fail_path(const wchar_t *label, const wchar_t *path) {
    fwprintf(stderr, L"BNS-DCS-MCP: %ls not found: %ls\n", label, path);
    fflush(stderr);
}

int wmain(void) {
    wchar_t exePath[32768];
    DWORD len = GetModuleFileNameW(NULL, exePath, (DWORD)(sizeof(exePath) / sizeof(exePath[0])));
    if (len == 0 || len >= (DWORD)(sizeof(exePath) / sizeof(exePath[0]))) {
        fwprintf(stderr, L"BNS-DCS-MCP: unable to resolve launcher path (Win32 error %lu)\n", GetLastError());
        return 2;
    }
    wchar_t *slash = wcsrchr(exePath, L'\\');
    if (!slash) {
        fwprintf(stderr, L"BNS-DCS-MCP: launcher path has no parent directory\n");
        return 2;
    }
    *slash = L'\0';

    wchar_t nodePath[32768], entryPath[32768], appDir[32768];
    if (swprintf_s(nodePath, _countof(nodePath), L"%ls\\runtime\\node.exe", exePath) < 0 ||
        swprintf_s(entryPath, _countof(entryPath), L"%ls\\app\\dist\\index.js", exePath) < 0 ||
        swprintf_s(appDir, _countof(appDir), L"%ls\\app", exePath) < 0) {
        fwprintf(stderr, L"BNS-DCS-MCP: installed path is too long\n");
        return 2;
    }
    if (!file_exists(nodePath)) { fail_path(L"private Node runtime", nodePath); return 3; }
    if (!file_exists(entryPath)) { fail_path(L"MCP entry point", entryPath); return 3; }

    SetEnvironmentVariableW(L"BNS_DCS_MCP_HOME", exePath);
    wchar_t commandLine[65536];
    if (swprintf_s(commandLine, _countof(commandLine), L"\"%ls\" \"%ls\"", nodePath, entryPath) < 0) {
        fwprintf(stderr, L"BNS-DCS-MCP: command line is too long\n");
        return 2;
    }

    STARTUPINFOW startup;
    PROCESS_INFORMATION process;
    ZeroMemory(&startup, sizeof(startup));
    ZeroMemory(&process, sizeof(process));
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);

    BOOL ok = CreateProcessW(nodePath, commandLine, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, appDir, &startup, &process);
    if (!ok) {
        fwprintf(stderr, L"BNS-DCS-MCP: failed to start private Node runtime (Win32 error %lu)\n", GetLastError());
        fflush(stderr);
        return 4;
    }
    CloseHandle(process.hThread);
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD exitCode = 1;
    if (!GetExitCodeProcess(process.hProcess, &exitCode)) exitCode = 1;
    CloseHandle(process.hProcess);
    return (int)exitCode;
}
