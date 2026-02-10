@concat0 = private unnamed_addr constant [15 x i8] c"Meriadok Aiko\0A\00"
@buf1 = private unnamed_addr constant [9 x i8] c"Player1 \00"
@buf2 = private unnamed_addr constant [16 x i8] c"Player1 Joined\0A\00"
@txt3 = private unnamed_addr constant [16 x i8] c"Player1 Joined\0A\00"
@txt4 = private unnamed_addr constant [34 x i8] c"Compilador Tom -> LLVM IR ativo!\0A\00"
declare i32 @printf(i8*, ...)

define i32 @main() {
entry:
  ; TOM_BUDGET_FRAME target_fps=60
  ; TOM_BUDGET_SYSTEM name=Particulas max_ms=2
  ; TOM_BUDGET_SYSTEM name=Fisica max_ms=3
  ; TOM_BUDGET_PRIORITY name=Jogador level=10
  ; TOM_BUDGET_PRIORITY name=Particulas level=3
  %r1 = add nsw i32 1000, 500
  %r2 = sub i64 1000, 2
  %r3 = fmul float 3.5, 2
  %r4 = fdiv double 22, 7
  %r5 = add <4 x i32> <i32 10, i32 20, i32 30, i32 40>, <i32 1, i32 2, i32 3, i32 4>
  %r6 = getelementptr inbounds [15 x i8], [15 x i8]* @concat0, i64 0, i64 0
  %r7 = getelementptr inbounds [9 x i8], [9 x i8]* @buf1, i64 0, i64 0
  %r8 = getelementptr inbounds [16 x i8], [16 x i8]* @buf2, i64 0, i64 0
  %r9 = getelementptr inbounds [16 x i8], [16 x i8]* @txt3, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r9)
  call i32 (i8*, ...) @printf(i8* %r8)
  %r10 = getelementptr inbounds [34 x i8], [34 x i8]* @txt4, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r10)
  ret i32 0
}
