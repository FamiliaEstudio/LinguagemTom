"""Targeted X11 desktop test, including WSLg's XWayland. No global keyboard hooks."""
import ctypes as C
import sys
import time
x = C.CDLL('libX11.so.6')
Display = C.c_void_p
Window = C.c_ulong
x.XOpenDisplay.restype = Display
x.XOpenDisplay.argtypes = [C.c_char_p]
d = x.XOpenDisplay(None)
if not d:
    raise RuntimeError('An X11/WSLg desktop is required (DISPLAY).')
def bind(name, args, result=C.c_int):
    f = getattr(x, name); f.argtypes = args; f.restype = result; return f
root = bind('XDefaultRootWindow', [Display], Window)(d)
query = bind('XQueryTree', [Display, Window, C.POINTER(Window), C.POINTER(Window), C.POINTER(C.POINTER(Window)), C.POINTER(C.c_uint)])
atom = bind('XInternAtom', [Display, C.c_char_p, C.c_int], Window)
getprop = bind('XGetWindowProperty', [Display, Window, Window, C.c_long, C.c_long, C.c_int, Window, C.POINTER(Window), C.POINTER(C.c_int), C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.c_void_p)])
free = bind('XFree', [C.c_void_p])
flush = bind('XFlush', [Display])
pid_atom = atom(d, b'_NET_WM_PID', 0)
def find(w):
    actual=Window(); fmt=C.c_int(); count=C.c_ulong(); remaining=C.c_ulong(); value=C.c_void_p()
    getprop(d,w,pid_atom,0,1,0,0,C.byref(actual),C.byref(fmt),C.byref(count),C.byref(remaining),C.byref(value))
    found=False
    if value:
        found=count.value == 1 and fmt.value == 32 and C.cast(value,C.POINTER(C.c_ulong))[0] == int(sys.argv[1])
        free(value)
    if found:return w
    r=Window();p=Window();children=C.POINTER(Window)();n=C.c_uint()
    if query(d,w,C.byref(r),C.byref(p),C.byref(children),C.byref(n)):
        for i in range(n.value):
            found=find(children[i])
            if found:break
        if children:free(children)
    return found
window=0
for _ in range(100):
    window=find(root)
    if window:break
    time.sleep(.1)
if not window:raise RuntimeError('Calculator X11 window was not created.')
class Input(C.Structure):
    _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',Display),('window',Window),('root',Window),('subwindow',Window),('time',C.c_ulong),('x',C.c_int),('y',C.c_int),('x_root',C.c_int),('y_root',C.c_int),('state',C.c_uint),('code',C.c_uint),('same_screen',C.c_int)]
class Data(C.Union):_fields_=[('b',C.c_char*20),('s',C.c_short*10),('l',C.c_long*5)]
class Client(C.Structure):
    _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',Display),('window',Window),('message_type',Window),('format',C.c_int),('data',Data)]
class Event(C.Union):_fields_=[('input',Input),('client',Client),('pad',C.c_long*24)]
send=bind('XSendEvent',[Display,Window,C.c_int,C.c_long,C.POINTER(Event)])
keysym=bind('XStringToKeysym',[C.c_char_p],Window)
keycode=bind('XKeysymToKeycode',[Display,Window],C.c_uint)
bind('XSetInputFocus',[Display,Window,C.c_int,C.c_ulong])(d,window,1,0)
def key(symbol, shift=False):
    e=Event(); e.input=Input(2,0,1,d,window,root,0,0,0,0,0,0,1 if shift else 0,keycode(d,keysym(symbol.encode())),1)
    send(d,window,0,1,C.byref(e));e.input.type=3;send(d,window,0,2,C.byref(e));flush(d);time.sleep(.03)
def text(value):
    for c in value:key({'+':'equal','*':'8',',':'comma','.':'period','/':'slash','=':'equal'}.get(c,c),c in '+*')
    time.sleep(.2)
def click(px,py):
    e=Event();e.input=Input(4,0,1,d,window,root,0,0,int(px*1.25),int(py*1.25),0,0,0,1,1)
    send(d,window,0,4,C.byref(e));e.input.type=5;send(d,window,0,8,C.byref(e));flush(d);time.sleep(.2)
try:
    time.sleep(.3);text('0.1+0,2=');key('Escape');text('2+3*4=');key('KP_Enter');time.sleep(.2);key('Escape')
    bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,600,800);flush(d);time.sleep(.4)
    click(180,480);click(400,480);click(290,480);key('Return');time.sleep(.2);key('Escape')
    text('1/0=');text('7+8=');key('Escape');text('0.1+0.2=');time.sleep(.4)
finally:
    e=Event();e.client=Client(33,0,1,d,window,atom(d,b'WM_PROTOCOLS',0),32,Data());e.client.data.l[0]=atom(d,b'WM_DELETE_WINDOW',0)
    send(d,window,0,0,C.byref(e));flush(d)
    bind('XCloseDisplay',[Display])(d)
