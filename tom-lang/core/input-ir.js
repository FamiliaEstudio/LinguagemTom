'use strict';

// Read a whitespace-delimited decimal integer without scanf's out-of-range UB.
// Magnitudes are unsigned i64, including 2^63 and 2^64-1.
module.exports = `
define internal i64 @tom_read_integer(i64 %positive_max, i64 %negative_max, ptr %message) {
entry:
  %character = alloca i32
  %magnitude = alloca i64
  %negative = alloca i1
  %has_digit = alloca i1
  %limit_slot = alloca i64
  store i64 0, ptr %magnitude
  store i1 false, ptr %negative
  store i1 false, ptr %has_digit
  store i64 %positive_max, ptr %limit_slot
  br label %skip
skip:
  %initial = call i32 @getchar()
  store i32 %initial, ptr %character
  %space = icmp eq i32 %initial, 32
  %low = icmp sge i32 %initial, 9
  %high = icmp sle i32 %initial, 13
  %control_space = and i1 %low, %high
  %is_space = or i1 %space, %control_space
  br i1 %is_space, label %skip, label %sign
sign:
  %is_minus = icmp eq i32 %initial, 45
  br i1 %is_minus, label %minus, label %plus
minus:
  %can_negative = icmp ne i64 %negative_max, 0
  br i1 %can_negative, label %set_negative, label %error
set_negative:
  store i1 true, ptr %negative
  store i64 %negative_max, ptr %limit_slot
  br label %next
plus:
  %is_plus = icmp eq i32 %initial, 43
  br i1 %is_plus, label %next, label %digit
next:
  %next_character = call i32 @getchar()
  store i32 %next_character, ptr %character
  br label %digit
digit:
  %ch = load i32, ptr %character
  %digit_low = icmp sge i32 %ch, 48
  %digit_high = icmp sle i32 %ch, 57
  %is_digit = and i1 %digit_low, %digit_high
  br i1 %is_digit, label %accumulate, label %end_token
accumulate:
  %d32 = sub i32 %ch, 48
  %d = zext i32 %d32 to i64
  %old = load i64, ptr %magnitude
  %limit = load i64, ptr %limit_slot
  %quotient = udiv i64 %limit, 10
  %remainder = urem i64 %limit, 10
  %too_large = icmp ugt i64 %old, %quotient
  %at_limit = icmp eq i64 %old, %quotient
  %digit_too_large = icmp ugt i64 %d, %remainder
  %edge_overflow = and i1 %at_limit, %digit_too_large
  %overflow = or i1 %too_large, %edge_overflow
  br i1 %overflow, label %error, label %store_digit
store_digit:
  %times_ten = mul i64 %old, 10
  %sum = add i64 %times_ten, %d
  store i64 %sum, ptr %magnitude
  store i1 true, ptr %has_digit
  br label %next
end_token:
  %eof = icmp eq i32 %ch, -1
  %end_space = icmp eq i32 %ch, 32
  %end_low = icmp sge i32 %ch, 9
  %end_high = icmp sle i32 %ch, 13
  %end_control = and i1 %end_low, %end_high
  %end_white = or i1 %end_space, %end_control
  %end_valid = or i1 %end_white, %eof
  %has_any = load i1, ptr %has_digit
  %valid = and i1 %has_any, %end_valid
  br i1 %valid, label %result, label %error
result:
  %mag = load i64, ptr %magnitude
  %neg = load i1, ptr %negative
  %negated = sub i64 0, %mag
  %value = select i1 %neg, i64 %negated, i64 %mag
  ret i64 %value
error:
  call void @tom_fail(ptr %message)
  unreachable
}
`;
