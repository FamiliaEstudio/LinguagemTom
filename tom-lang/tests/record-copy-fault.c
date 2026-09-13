#include "../runtime/stable/tom_runtime.h"
static int armed, calls, triggered;
extern int32_t __real_tom_require(int32_t);
extern int32_t __real_tom_decimal_copy(const TomDecimal *, TomDecimal **);
int32_t __wrap_tom_require(int32_t value) {
    if (!triggered) armed = 1;
    return __real_tom_require(value);
}
int32_t __wrap_tom_decimal_copy(const TomDecimal *value, TomDecimal **out) {
    if (armed && ++calls == 2) {
        armed = 0; triggered = 1;
        return TOM_MEMORY;
    }
    return __real_tom_decimal_copy(value, out);
}
