@budget_name0 = private unnamed_addr constant [7 x i8] c"Fisica\00"
@txt1 = private unnamed_addr constant [35 x i8] c"Fisica simplificada (stress alto)\0A\00"
@concat2 = private unnamed_addr constant [15 x i8] c"Meriadok Aiko\0A\00"
@buf3 = private unnamed_addr constant [9 x i8] c"Player1 \00"
@buf4 = private unnamed_addr constant [16 x i8] c"Player1 Joined\0A\00"
@txt5 = private unnamed_addr constant [16 x i8] c"Player1 Joined\0A\00"
@txt6 = private unnamed_addr constant [34 x i8] c"Compilador Tom -> LLVM IR ativo!\0A\00"
declare i32 @printf(i8*, ...)
declare i64 @llvm.readcyclecounter()
declare void @TomBudgetManager_Report(i8*, i64)
@TomPerf_StressLevel = external global i32

define i32 @main() {
entry:
  %tom_budget_cycle_start = call i64 @llvm.readcyclecounter()
  ; TOM_BUDGET_FRAME target_fps=60
  ; TOM_BUDGET_SYSTEM name=Particulas max_ms=2
  ; TOM_BUDGET_SYSTEM name=Fisica max_ms=3
  ; TOM_BUDGET_PRIORITY name=Jogador level=10
  ; TOM_BUDGET_PRIORITY name=Particulas level=3
  br label %escopo_Fisica_ini_1
escopo_Fisica_ini_1:
  %r1 = call i64 @llvm.readcyclecounter()
  ; TOM_BUDGET_SCOPE_BEGIN name=Fisica
  %r2 = add nsw i32 1000, 500
  %r3 = sub i64 1000, 2
  %r4 = fmul float 3.5, 2
  %r5 = fdiv double 22, 7
  %r6 = add <4 x i32> <i32 10, i32 20, i32 30, i32 40>, <i32 1, i32 2, i32 3, i32 4>
  br label %escopo_Fisica_fim_2
escopo_Fisica_fim_2:
  %r7 = call i64 @llvm.readcyclecounter()
  %r8 = sub i64 %r7, %r1
  %r9 = getelementptr inbounds [7 x i8], [7 x i8]* @budget_name0, i64 0, i64 0
  call void @TomBudgetManager_Report(i8* %r9, i64 %r8)
  ; TOM_BUDGET_SCOPE_END name=Fisica
  br label %escopo_Degradacao_ini_3
escopo_Degradacao_ini_3:
  %r10 = icmp sgt i32 @TomPerf_StressLevel, 50
  br i1 %r10, label %se_maior_verdadeiro_5, label %escopo_Degradacao_fim_4
se_maior_verdadeiro_5:
  %r11 = getelementptr inbounds [35 x i8], [35 x i8]* @txt1, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r11)
  br label %escopo_Degradacao_fim_4
escopo_Degradacao_fim_4:
  %r12 = getelementptr inbounds [15 x i8], [15 x i8]* @concat2, i64 0, i64 0
  %r13 = getelementptr inbounds [9 x i8], [9 x i8]* @buf3, i64 0, i64 0
  %r14 = getelementptr inbounds [16 x i8], [16 x i8]* @buf4, i64 0, i64 0
  %r15 = getelementptr inbounds [16 x i8], [16 x i8]* @txt5, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r15)
  call i32 (i8*, ...) @printf(i8* %r14)
  %r16 = getelementptr inbounds [34 x i8], [34 x i8]* @txt6, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r16)
  ; TOM_GPU_BUFFER_CREATE name=BufPos type=Fl32 count=4000000
  ; TOM_GPU_BUFFER_CREATE name=BufVel type=Fl32 count=4000000
  ; TOM_GPU_UPLOAD type=Fl32 host=RamPos device=BufPos
  ; TOM_GPU_UPLOAD type=Fl32 host=RamVel device=BufVel
  ; TOM_GPU_KERNEL_BEGIN name=AtualizaParticula
  ; TOM_GPU_KERNEL_OP kernel=AtualizaParticula op=id var=MeuId
  ; TOM_GPU_KERNEL_OP kernel=AtualizaParticula op=load_vec4 type=Fl32 buffer=BufPos index=MeuId out=PosAtual
  ; TOM_GPU_KERNEL_OP kernel=AtualizaParticula op=load_vec4 type=Fl32 buffer=BufVel index=MeuId out=VelAtual
  ; TOM_GPU_KERNEL_OP kernel=AtualizaParticula op=somar_vec4 type=Fl32 left=PosAtual right=VelAtual out=NovaPos
  ; TOM_GPU_KERNEL_OP kernel=AtualizaParticula op=store_vec4 type=Fl32 buffer=BufPos index=MeuId in=NovaPos
  ; TOM_GPU_KERNEL_END name=AtualizaParticula
  ; TOM_GPU_DISPATCH kernel=AtualizaParticula x=1000000 y=1 z=1
  ; TOM_GPU_DOWNLOAD type=Fl32 device=BufPos host=RamPos
  %tom_budget_cycle_end = call i64 @llvm.readcyclecounter()
  %tom_budget_cycle_elapsed = sub i64 %tom_budget_cycle_end, %tom_budget_cycle_start
  call void @TomBudgetManager_Report(i8* null, i64 %tom_budget_cycle_elapsed)
  ret i32 0
}
