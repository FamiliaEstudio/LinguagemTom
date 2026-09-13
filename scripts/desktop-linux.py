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
    if '--state' in sys.argv:e.input.time=int(time.monotonic()*1000)&0xffffffff
    send(d,window,0,1,C.byref(e));e.input.type=3;send(d,window,0,2,C.byref(e));flush(d);time.sleep(.03)
def text(value):
    for c in value:key({'+':'equal','*':'8',',':'comma','.':'period','/':'slash','=':'equal'}.get(c,c),c in '+*')
    time.sleep(.2)
def click(px,py):
    e=Event();e.input=Input(4,0,1,d,window,root,0,0,int(px*1.25),int(py*1.25),0,0,0,1,1)
    send(d,window,0,4,C.byref(e));e.input.type=5;send(d,window,0,8,C.byref(e));flush(d);time.sleep(.2)
def state_pointer(px,py,kind=4):
    name=sys.argv[sys.argv.index('--state')+1]
    logical_w,logical_h=(1100,760) if name=='musical' else (960,720) if name=='laboratorio' else (620,400)
    r=Window();gx=C.c_int();gy=C.c_int();w=C.c_uint();h=C.c_uint();border=C.c_uint();depth=C.c_uint()
    geometry=bind('XGetGeometry',[Display,Window,C.POINTER(Window),C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_uint),C.POINTER(C.c_uint),C.POINTER(C.c_uint),C.POINTER(C.c_uint)])
    geometry(d,window,C.byref(r),C.byref(gx),C.byref(gy),C.byref(w),C.byref(h),C.byref(border),C.byref(depth))
    scale=min(w.value/logical_w,h.value/logical_h)
    x_pos=int((w.value-logical_w*scale)/2+px*scale);y_pos=int((h.value-logical_h*scale)/2+py*scale)
    e=Event();e.input=Input(kind,0,1,d,window,root,0,0,x_pos,y_pos,0,0,256 if kind==6 else 0,0 if kind==6 else 1,1)
    e.input.time=int(time.monotonic()*1000)&0xffffffff
    send(d,window,0,64 if kind==6 else 4 if kind==4 else 8,C.byref(e));flush(d);time.sleep(.06)
def state_click(px,py):
    state_pointer(px,py);state_pointer(px,py,5);time.sleep(.12)
try:
    if '--state' in sys.argv:
        name=sys.argv[sys.argv.index('--state')+1];time.sleep(.7)
        if name=='musical':
            if '--production' not in sys.argv:
                state_click(820,520);state_click(420,500);key('z');state_click(245,380);state_click(160,680)
            state_click(180,590);time.sleep(1.2);key('F1');text('fcde')
            key('Escape');time.sleep(.2);key('Escape')
            bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,1320,912);flush(d);time.sleep(.4)
            bind('XSetInputFocus',[Display,Window,C.c_int,C.c_ulong])(d,root,1,0);flush(d);time.sleep(.2)
            bind('XSetInputFocus',[Display,Window,C.c_int,C.c_ulong])(d,window,1,0);flush(d)
            state_click(160,650);time.sleep(.3)
        elif name=='laboratorio':
            if '--production' not in sys.argv:state_click(260,445)
            state_click(80,445);time.sleep(2.6);text('ace')
            state_click(680,498)
            state_pointer(80,498);state_pointer(250,498,6);state_pointer(250,498,5)
            if '--production' not in sys.argv:
                state_click(120,548);key('z');key('z')
                state_click(460,548);state_click(450,445);state_click(650,445)
                trace=sys.argv[sys.argv.index('--trace')+1]
                for _ in range(150):
                    with open(trace,encoding='utf-8') as f:completed='Reprodução concluída.' in f.read()
                    if completed:break
                    time.sleep(.2)
                if not completed:raise RuntimeError('Replay did not complete in the desktop window.')
            bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,1152,864)
        else:
            state_click(70,100);state_click(250,100)
            state_pointer(100,160);state_pointer(600,160,6);state_pointer(600,160,5)
            key('Tab');key('Return');bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,930,600)
        flush(d);time.sleep(.5)
    elif '--multimedia' in sys.argv:
        time.sleep(1.3)
        text('acegwr');key('space');time.sleep(.2);key('space')
        bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,1000,600);flush(d);time.sleep(.5)
        # Targeted focus events clear held keys without affecting unrelated windows.
        bind('XSetInputFocus',[Display,Window,C.c_int,C.c_ulong])(d,root,1,0);flush(d);time.sleep(.2)
        bind('XSetInputFocus',[Display,Window,C.c_int,C.c_ulong])(d,window,1,0);flush(d);key('space');text('c');time.sleep(.5)
    else:
        time.sleep(.3);text('0.1+0,2=');key('Escape');text('2+3*4=');key('KP_Enter');time.sleep(.2);key('Escape')
        bind('XResizeWindow',[Display,Window,C.c_uint,C.c_uint])(d,window,600,800);flush(d);time.sleep(.4)
        click(180,480);click(400,480);click(290,480);key('Return');time.sleep(.2);key('Escape')
        text('1/0=');text('7+8=');key('Escape');text('0.1+0.2=');time.sleep(.4)
finally:
    e=Event();e.client=Client(33,0,1,d,window,atom(d,b'WM_PROTOCOLS',0),32,Data());e.client.data.l[0]=atom(d,b'WM_DELETE_WINDOW',0)
    send(d,window,0,0,C.byref(e));flush(d)
    bind('XCloseDisplay',[Display])(d)
