param([int]$ProcessId, [switch]$Multimedia, [string]$StateDemo, [switch]$Production, [string]$Trace)
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
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct Rect { public int left, top, right, bottom; }
  public static void Click(IntPtr w, IntPtr point) {
    // Queue the whole gesture together: SDL otherwise reconciles the synthetic
    // held button with GetAsyncKeyState between PowerShell invocations.
    PostMessage(w,0x200,IntPtr.Zero,point); PostMessage(w,0x201,(IntPtr)1,point);
    PostMessage(w,0x202,IntPtr.Zero,point);
  }
  public static void Drag(IntPtr w, IntPtr start, IntPtr end) {
    PostMessage(w,0x200,IntPtr.Zero,start); PostMessage(w,0x201,(IntPtr)1,start);
    PostMessage(w,0x200,(IntPtr)1,end); PostMessage(w,0x202,IntPtr.Zero,end);
  }
  public static IntPtr Find(uint wanted) { IntPtr found = IntPtr.Zero;
    EnumWindows((w,a) => { uint pid; GetWindowThreadProcessId(w,out pid); if(pid==wanted && IsWindowVisible(w)) { found=w; return false; } return true; },IntPtr.Zero); return found; }
}
'@
if ($StateDemo) { [void][TomDesktop]::SetProcessDPIAware() }
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
function State-Point([int]$x, [int]$y) {
  $client = New-Object TomDesktop+Rect
  [void][TomDesktop]::GetClientRect($window,[ref]$client)
  $lw = 620; $lh = 400
  if ($StateDemo -eq 'laboratorio') { $lw = 960; $lh = 720 }
  if ($StateDemo -eq 'musical') { $lw = 1100; $lh = 760 }
  $scale = [Math]::Min($client.right / $lw, $client.bottom / $lh)
  $px = [int](($client.right - $lw * $scale) / 2 + $x * $scale)
  $py = [int](($client.bottom - $lh * $scale) / 2 + $y * $scale)
  return [IntPtr]($px + ($py -shl 16))
}
function State-Click([int]$x, [int]$y) { [TomDesktop]::Click($window,(State-Point $x $y)); Pause-Frame }
function State-Drag([int]$x, [int]$y, [int]$end) { [TomDesktop]::Drag($window,(State-Point $x $y),(State-Point $end $y)); Pause-Frame }
try {
  if ($StateDemo) {
    Start-Sleep -Milliseconds 700
    if ($StateDemo -eq 'musical') {
      if (-not $Production) { State-Click 820 520; State-Click 420 500; Send-Key 90; State-Click 245 380; State-Click 160 680 }
      State-Click 180 590
      Start-Sleep -Milliseconds 1200
      Send-Key 112
      foreach ($key in @(70,67,68,69)) { Send-Key $key }
      Send-Key 27; Send-Key 27
      [void][TomDesktop]::SetWindowPos($window,[IntPtr]::Zero,40,40,1320,912,4)
      Pause-Frame
      [void][TomDesktop]::PostMessage($window,0x8,[IntPtr]::Zero,[IntPtr]::Zero)
      Pause-Frame
      [void][TomDesktop]::PostMessage($window,0x7,[IntPtr]::Zero,[IntPtr]::Zero)
      State-Click 160 650
    } elseif ($StateDemo -eq 'laboratorio') {
      if (-not $Production) { State-Click 260 445 }
      State-Click 80 445
      Start-Sleep -Milliseconds 2600
      foreach ($key in @(65,67,69)) { Send-Key $key }
      State-Click 680 498
      State-Drag 80 498 250
      if (-not $Production) {
        State-Click 120 548; Send-Key 90; Send-Key 90
        State-Click 460 548; State-Click 450 445; State-Click 650 445
        $completed = $false
        for ($wait = 0; $wait -lt 150; $wait++) {
          if ((Get-Content -Raw -Encoding UTF8 $Trace) -match 'VISUAL Reprodu.+conclu.da\.') { $completed = $true; break }
          Start-Sleep -Milliseconds 200
        }
        if (-not $completed) { throw 'Replay did not complete in the desktop window.' }
      }
      [void][TomDesktop]::SetWindowPos($window,[IntPtr]::Zero,40,40,1152,864,4)
    } else {
      State-Click 70 100; State-Click 250 100
      State-Drag 100 160 600
      Send-Key 9; Send-Key 13
      [void][TomDesktop]::SetWindowPos($window,[IntPtr]::Zero,40,40,930,600,4)
    }
    Start-Sleep -Milliseconds 500
  } elseif ($Multimedia) {
    Start-Sleep -Milliseconds 1300
    foreach ($key in @(65,67,69,71,87,82)) { Send-Key $key }
    Send-Key 32
    Send-Key 32
    [void][TomDesktop]::SetWindowPos($window,[IntPtr]::Zero,40,40,1000,600,4)
    Pause-Frame
    [void][TomDesktop]::PostMessage($window,0x8,[IntPtr]::Zero,[IntPtr]::Zero)
    Pause-Frame
    [void][TomDesktop]::PostMessage($window,0x7,[IntPtr]::Zero,[IntPtr]::Zero)
    Send-Key 32
    Send-Key 67
    Start-Sleep -Milliseconds 500
  } else {
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
  }
} finally { [void][TomDesktop]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) }
