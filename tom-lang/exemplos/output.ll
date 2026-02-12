declare void @TomGpu_Present(i32*, i32, i32)
declare void @TomGpu_LerInput(i32*)
declare void @TomGpu_EnfileirarAudio(float*, i32)
declare i64 @llvm.readcyclecounter()
declare void @TomBudgetManager_Report(i8*, i64)
@TomPerf_StressLevel = external global i32

define i32 @main() {
entry:
  %tom_budget_cycle_start = call i64 @llvm.readcyclecounter()
  ; TOM_BUDGET_FRAME target_fps=60
  ; TOM_BUDGET_SYSTEM name=Audio max_ms=4
  ; TOM_BUDGET_SYSTEM name=Video max_ms=8
  ; TOM_BUDGET_PRIORITY name=Audio level=10
  ; TOM_BUDGET_PRIORITY name=Video level=8
  %r1 = alloca i32
  store i32 320, i32* %r1
  %r2 = alloca i32
  store i32 200, i32* %r2
  %r3 = alloca i32
  store i32 2048, i32* %r3
  %r4 = alloca i32
  store i32 0, i32* %r4
  %r5 = alloca i32
  store i32 1, i32* %r5
  %r6 = alloca i32
  store i32 8, i32* %r6
  %r7 = alloca i32
  store i32 65793, i32* %r7
  %r8 = alloca [64000 x i32]
  %r9 = getelementptr inbounds [64000 x i32], [64000 x i32]* %r8, i64 0, i64 0
  ; TOM_GPU_BUFFER_CREATE name=VideoBuf type=In32 count=64000
  %r10 = alloca [2048 x float]
  %r11 = getelementptr inbounds [2048 x float], [2048 x float]* %r10, i64 0, i64 0
  ; TOM_GPU_BUFFER_CREATE name=AudioBuf type=Fl32 count=2048
  %r12 = alloca [300 x i32]
  %r13 = getelementptr inbounds [300 x i32], [300 x i32]* %r12, i64 0, i64 0
  ; TOM_GPU_BUFFER_CREATE name=InputBuf type=In32 count=300
  ; TOM_GPU_KERNEL_BEGIN name=SintetizarAudio
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=id var=SampleId
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=load_scalar type=In32 buffer=InputBuf index=Um out=MouseY
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=multi_scalar type=Fl32 left=SampleId right=0.1 out=Base
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=multi_scalar type=Fl32 left=MouseY right=0.01 out=FreqMod
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=somar_scalar type=Fl32 left=Base right=FreqMod out=Fase
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=sin_scalar type=Fl32 in=Fase out=Sinal
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=multi_scalar type=Fl32 left=Sinal right=0.5 out=Amostra
  ; TOM_GPU_KERNEL_OP kernel=SintetizarAudio op=store_scalar type=Fl32 buffer=AudioBuf index=SampleId in=Amostra
  ; TOM_GPU_KERNEL_END name=SintetizarAudio
  ; TOM_GPU_KERNEL_BEGIN name=PlasmaVideo
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=id var=PixelId
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=divid_scalar type=In32 left=PixelId right=TelaW out=PixelY
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=multi_scalar type=In32 left=PixelY right=TelaW out=LinhaBase
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=subtr_scalar type=In32 left=PixelId right=LinhaBase out=PixelX
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=load_scalar type=In32 buffer=InputBuf index=Zero out=MouseX
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=somar_scalar type=In32 left=PixelX right=MouseX out=MovX
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=divid_scalar type=In32 left=MovX right=Oito out=FaixaX
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=divid_scalar type=In32 left=PixelY right=Oito out=FaixaY
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=somar_scalar type=In32 left=FaixaX right=FaixaY out=Plasma
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=multi_scalar type=In32 left=Plasma right=CorPasso out=CorRGB
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=store_scalar type=In32 buffer=VideoBuf index=PixelId in=CorRGB
  ; TOM_GPU_KERNEL_END name=PlasmaVideo
  br label %escopo_MainLoop_ini_1
escopo_MainLoop_ini_1:
  call void @TomGpu_LerInput(i32* %r13)
  ; TOM_GPU_DISPATCH kernel=SintetizarAudio x=2048 y=1 z=1
  %r14 = load i32, i32* %r3
  call void @TomGpu_EnfileirarAudio(float* %r11, i32 %r14)
  ; TOM_GPU_DISPATCH kernel=PlasmaVideo x=64000 y=1 z=1
  %r15 = load i32, i32* %r1
  %r16 = load i32, i32* %r2
  call void @TomGpu_Present(i32* %r9, i32 %r15, i32 %r16)
  br label %escopo_MainLoop_fim_2
escopo_MainLoop_fim_2:
  %tom_budget_cycle_end = call i64 @llvm.readcyclecounter()
  %tom_budget_cycle_elapsed = sub i64 %tom_budget_cycle_end, %tom_budget_cycle_start
  call void @TomBudgetManager_Report(i8* null, i64 %tom_budget_cycle_elapsed)
  ret i32 0
}
