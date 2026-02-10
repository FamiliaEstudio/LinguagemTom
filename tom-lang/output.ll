@concat0 = private unnamed_addr constant [16 x i8] c"Meriadok Aiko\5Cn\00"
@concat1 = private unnamed_addr constant [9 x i8] c"Hi Tom\5Cn\00"
@txt2 = private unnamed_addr constant [35 x i8] c"Compilador Tom -> LLVM IR ativo!\5Cn\00"
declare i32 @printf(i8*, ...)

define i32 @main() {
entry:
  %r1 = add nsw i32 1000, 500
  %r2 = sub i64 1000, 2
  %r3 = fmul float 3.5, 2
  %r4 = fdiv double 22, 7
  %r5 = add <4 x i32> <i32 10, i32 20, i32 30, i32 40>, <i32 1, i32 2, i32 3, i32 4>
  %r6 = getelementptr inbounds [16 x i8], [16 x i8]* @concat0, i64 0, i64 0
  %r7 = getelementptr inbounds [9 x i8], [9 x i8]* @concat1, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r7)
  %r8 = getelementptr inbounds [35 x i8], [35 x i8]* @txt2, i64 0, i64 0
  call i32 (i8*, ...) @printf(i8* %r8)
  ret i32 0
}
