@fatal0 = private unnamed_addr constant [68 x i8] c"Erro de compilação: Comando não reconhecido: DefVarInSd32xZero0\0A\00"
declare i32 @printf(i8*, ...)
declare void @TomGpu_Present(i32*, i32, i32)
declare void @TomGpu_LerInput(i32*)
declare i64 @llvm.readcyclecounter()
declare void @TomBudgetManager_Report(i8*, i64)
@TomPerf_StressLevel = external global i32

define i32 @main() {
entry:
  %tom_budget_cycle_start = call i64 @llvm.readcyclecounter()
  ; TOM_BUDGET_FRAME target_fps=60
  ; TOM_BUDGET_SYSTEM name=Video max_ms=8
  ; TOM_BUDGET_PRIORITY name=Video level=8
  %r1 = alloca i32
  store i32 320, i32* %r1
  %r2 = alloca i32
  store i32 200, i32* %r2
  %r3 = alloca i32
  store i32 -1, i32* %r3
  %r4 = alloca [64000 x i32]
  %r5 = getelementptr inbounds [64000 x i32], [64000 x i32]* %r4, i64 0, i64 0
  ; TOM_GPU_BUFFER_CREATE name=VideoBuf type=In32 count=64000
  %r6 = alloca [300 x i32]
  %r7 = getelementptr inbounds [300 x i32], [300 x i32]* %r6, i64 0, i64 0
  ; TOM_GPU_BUFFER_CREATE name=InputBuf type=In32 count=300
  ; TOM_GPU_KERNEL_BEGIN name=PlasmaVideo
  ; TOM_GPU_KERNEL_OP kernel=PlasmaVideo op=id var=PixelId
  ; TOM_GPU_KERNEL_END name=PlasmaVideo
  br label %escopo_MainLoop_ini_1
escopo_MainLoop_ini_1:
  call void @TomGpu_LerInput(i32* %r7)
  ; TOM_GPU_DISPATCH kernel=PlasmaVideo x=1000 y=1 z=1
  call void @TomGpu_Present(i32* %r5, i32 320, i32 200)
  br label %escopo_MainLoop_ini_1
escopo_MainLoop_fim_2:
  %tom_budget_cycle_end = call i64 @llvm.readcyclecounter()
  %tom_budget_cycle_elapsed = sub i64 %tom_budget_cycle_end, %tom_budget_cycle_start
  call void @TomBudgetManager_Report(i8* null, i64 %tom_budget_cycle_elapsed)
  %r8 = getelementptr inbounds [68 x i8], [68 x i8]* @fatal0, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r8)
  ret i32 1
}
