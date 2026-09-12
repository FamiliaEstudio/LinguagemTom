param([int]$ProcessId)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TomDesktop {
  public delegate bool Enumerator(IntPtr w, IntPtr arg);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Enumerator cb, IntPtr arg);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr w);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr w, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint kind);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr w, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr w, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr w, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public struct Rect { public int left, top, right, bottom; }
  public static IntPtr Find(uint wanted) { IntPtr found = IntPtr.Zero;
    EnumWindows((w,a) => { uint pid; GetWindowThreadProcessId(w,out pid); if(pid==wanted && IsWindowVisible(w)) { found=w; return false; } return true; },IntPtr.Zero); return found; }
}
'@
$window = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 100; $attempt++) {
  $window = [TomDesktop]::Find($ProcessId)
  if ($window -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 100
}
if ($window -eq [IntPtr]::Zero) { throw 'Calculator window was not created.' }
function Pause-Frame { Start-Sleep -Milliseconds 180 }
function Send-Text([string]$text) {
  foreach ($character in $text.ToCharArray()) { [void][TomDesktop]::PostMessage($window, 0x102, [IntPtr][int]$character, [IntPtr]1); Start-Sleep -Milliseconds 15 }
  Pause-Frame
}
function Send-Key([int]$key, [bool]$extended = $false) {
  $scan = [TomDesktop]::MapVirtualKey($key, 0)
  if ($extended) { $scan += 256 }
  [void][TomDesktop]::PostMessage($window, 0x100, [IntPtr]$key, [IntPtr](1 + ($scan -shl 16)))
  [void][TomDesktop]::PostMessage($window, 0x101, [IntPtr]$key, [IntPtr](3221225473L + ($scan -shl 16)))
  Pause-Frame
}
function Click-Logical([int]$x, [int]$y) {
  $client = New-Object TomDesktop+Rect
  [void][TomDesktop]::GetClientRect($window, [ref]$client)
  $px = [int]($x * $client.right / 480); $py = [int]($y * $client.bottom / 640)
  [void][TomDesktop]::PostMessage($window, 0x201, [IntPtr]1, [IntPtr]($px + ($py -shl 16)))
  [void][TomDesktop]::PostMessage($window, 0x202, [IntPtr]0, [IntPtr]($px + ($py -shl 16)))
  Pause-Frame
}
try {
  Pause-Frame
  Send-Text '0.1+0,2='
  Send-Key 27
  Send-Text '2+3*4='
  Send-Key 13 $true
  Send-Key 27
  $client = New-Object TomDesktop+Rect; $outer = New-Object TomDesktop+Rect
  [void][TomDesktop]::GetClientRect($window,[ref]$client); [void][TomDesktop]::GetWindowRect($window,[ref]$outer)
  [void][TomDesktop]::SetWindowPos($window,[IntPtr]::Zero,40,40,(600+$outer.right-$outer.left-$client.right),(800+$outer.bottom-$outer.top-$client.bottom),4)
  Pause-Frame
  Click-Logical 180 480
  Click-Logical 400 480
  Click-Logical 290 480
  Send-Key 13
  Send-Key 27
  Send-Text '1/0='
  Send-Text '7+8='
  Send-Key 27
  Send-Text '0.1+0.2='
  Start-Sleep -Milliseconds 400
} finally { [void][TomDesktop]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) }
