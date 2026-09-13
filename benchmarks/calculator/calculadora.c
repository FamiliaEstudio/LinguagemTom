/* C17 reference for exemplos/calculadora.tom. Arithmetic, text and SDL use the
 * same public Tom runtime. No double arithmetic or calculator logic in the host.
 * This is an idiomatic C port, not an instruction-for-instruction LLVM clone. */
#include "tom_runtime.h"
#include <stdbool.h>
#include <stdio.h>

#define TRY(call) do { error = (call); if (error) goto cleanup; } while (0)

typedef struct {
    TomWindow *janela;
    TomFont *grande, *pequena, *visor;
    TomEvent *evento;
    TomText *entrada, *mensagem;
    TomDecimal *acumulador, *ultimo_direito;
    int32_t pendente, ultimo_operador;
    bool tem_ultimo, nova, com_erro, executar, redesenhar;
} Calculadora;

typedef struct {
    const char *rotulo;
    int32_t x, y, largura, comando;
    uint32_t cor;
} BotaoInfo;

static const BotaoInfo botoes[] = {
    {"C",  24,216,102,17,847521791}, {"⌫",134,216,102,18,847521791},
    {"±", 244,216,102,16,847521791}, {"÷",354,216,102,14,626861055},
    {"7",  24,296,102, 7,784044799}, {"8",134,296,102, 8,784044799},
    {"9", 244,296,102, 9,784044799}, {"×",354,296,102,13,626861055},
    {"4",  24,376,102, 4,784044799}, {"5",134,376,102, 5,784044799},
    {"6", 244,376,102, 6,784044799}, {"−",354,376,102,12,626861055},
    {"1",  24,456,102, 1,784044799}, {"2",134,456,102, 2,784044799},
    {"3", 244,456,102, 3,784044799}, {"+",354,456,102,11,626861055},
    {"0",  24,536,102, 0,784044799}, {",",134,536,102,10,784044799},
    {"=", 244,536,212,15,626861055},
};

static int32_t Comando(int32_t codigo) {
    if (codigo >= 48 && codigo <= 57) return codigo - 48;
    switch (codigo) {
        case 46: case 44: return 10;
        case 43: return 11;
        case 45: case 8722: return 12;
        case 42: case 215: return 13;
        case 47: case 247: return 14;
        case 61: case 13: return 15;
        case 177: return 16;
        case 27: case 99: case 67: return 17;
        case 8: return 18;
        default: return -1;
    }
}

static int32_t Calcular(int32_t operador, const TomDecimal *a,
                        const TomDecimal *b, TomDecimal **out) {
    if (operador >= 11 && operador <= 14)
        return tom_decimal_math(operador - 11, a, b, out);
    return tom_decimal_copy(b, out);
}

static int32_t Valor(const char *entrada, TomDecimal **out) {
    int32_t error = 0, codigo;
    uint64_t n;
    TomText *normal = NULL;
    TRY(tom_text_new(128, "", &normal));
    TRY(tom_text_set(normal, entrada));
    TRY(tom_text_characters(tom_text_data(normal), &n));
    if (!n) { error = TOM_OVERFLOW; goto cleanup; }
    TRY(tom_text_codepoint(tom_text_data(normal), n - 1, &codigo));
    if (codigo == 46) TRY(tom_text_append(normal, "0"));
    TRY(tom_decimal_parse(tom_text_data(normal), out));
cleanup:
    tom_text_free(normal);
    return error;
}

static int32_t Digitar(TomText *entrada, int32_t comando, bool nova) {
    int32_t error = 0, codigo;
    uint64_t n;
    TomText *digito = NULL;
    if (nova) TRY(tom_text_set(entrada, "0"));
    if (comando < 10) {
        TRY(tom_text_length(entrada, &n));
        if (n == 1) {
            TRY(tom_text_codepoint(tom_text_data(entrada), 0, &codigo));
            if (codigo == 48) TRY(tom_text_clear(entrada));
        }
        TRY(tom_text_new(16, "", &digito));
        TRY(tom_integer_format(comando, digito));
        TRY(tom_text_append(entrada, tom_text_data(digito)));
    } else {
        TRY(tom_text_characters(tom_text_data(entrada), &n));
        for (uint64_t i = 0; i < n; i++) {
            TRY(tom_text_codepoint(tom_text_data(entrada), i, &codigo));
            if (codigo == 46) goto cleanup;
        }
        TRY(tom_text_append(entrada, "."));
    }
cleanup:
    tom_text_free(digito);
    return error;
}

static int32_t Sinal(TomText *entrada) {
    int32_t error = 0, codigo;
    uint64_t n;
    TomText *novo = NULL;
    TRY(tom_text_codepoint(tom_text_data(entrada), 0, &codigo));
    if (codigo == 45) {
        TRY(tom_text_characters(tom_text_data(entrada), &n));
        TRY(tom_text_slice(entrada, tom_text_data(entrada), 1, n - 1));
    } else {
        TRY(tom_text_new(128, "-", &novo));
        TRY(tom_text_append(novo, tom_text_data(entrada)));
        TRY(tom_text_set(entrada, tom_text_data(novo)));
    }
cleanup:
    tom_text_free(novo);
    return error;
}

static int32_t Apagar(TomText *entrada, bool nova) {
    int32_t error = 0, codigo;
    uint64_t n;
    if (nova) return tom_text_set(entrada, "0");
    TRY(tom_text_pop(entrada));
    TRY(tom_text_length(entrada, &n));
    if (n == 0) TRY(tom_text_set(entrada, "0"));
    else if (n == 1) {
        TRY(tom_text_codepoint(tom_text_data(entrada), 0, &codigo));
        if (codigo == 45) TRY(tom_text_set(entrada, "0"));
    }
cleanup:
    return error;
}

#ifndef TOM_BENCH_HEADLESS
static int32_t Botao(TomWindow *j, TomFont *f, const BotaoInfo *b) {
    int32_t error = 0, largura;
    TRY(tom_draw_rect(j, b->x, b->y, b->largura, 72, b->cor));
    TRY(tom_measure_text(f, b->rotulo, &largura));
    TRY(tom_draw_text(j, f, b->rotulo, b->x + (b->largura - largura) / 2,
                      b->y + 20, UINT32_MAX));
cleanup:
    return error;
}
#endif

static int32_t Desenhar(Calculadora *s) {
    int32_t error = 0;
    TomText *exibicao = NULL;
#ifndef TOM_BENCH_HEADLESS
    TRY(tom_window_clear(s->janela, 303570687));
    TRY(tom_draw_text(s->janela, s->pequena, "TOM / DECIMAL 34", 24, 24, 2375463679));
    TRY(tom_draw_rect(s->janela, 24, 60, 432, 108, 438514943));
#endif
    TRY(tom_text_new(128, "", &exibicao));
    TRY(tom_text_set(exibicao, tom_text_data(s->entrada)));
    TRY(tom_text_replace_ascii(exibicao, 46, 44));
    TRY(tom_draw_text(s->janela, s->visor, tom_text_data(exibicao), 36, 86, UINT32_MAX));
    TRY(tom_draw_text(s->janela, s->pequena, tom_text_data(s->mensagem), 24, 176, 4292321535));
#ifndef TOM_BENCH_HEADLESS
    for (size_t i = 0; i < sizeof(botoes) / sizeof(*botoes); i++)
        TRY(Botao(s->janela, s->grande, &botoes[i]));
#endif
    TRY(tom_window_present(s->janela));
cleanup:
    tom_text_free(exibicao);
    return error;
}

static int32_t Posicao(int32_t x, int32_t y) {
    for (size_t i = 0; i < sizeof(botoes) / sizeof(*botoes); i++) {
        const BotaoInfo *b = &botoes[i];
        if (x >= b->x && x < b->x + b->largura && y >= b->y && y < b->y + 72)
            return b->comando;
    }
    return -1;
}

static int32_t Reiniciar(Calculadora *s) {
    int32_t error = 0;
    TRY(tom_text_set(s->entrada, "0"));
    TRY(tom_text_clear(s->mensagem));
    TRY(tom_decimal_parse("0", &s->acumulador));
    TRY(tom_decimal_parse("0", &s->ultimo_direito));
    s->pendente = s->ultimo_operador = 0;
    s->tem_ultimo = s->com_erro = false;
    s->nova = s->redesenhar = true;
cleanup:
    return error;
}

static int32_t Processar(Calculadora *s, int32_t comando) {
    int32_t error = 0;
    TomDecimal *direito = NULL;
    if (comando == 17 || (s->com_erro && comando >= 0 && comando <= 10)) TRY(Reiniciar(s));
    if (s->com_erro) goto cleanup;
    if (comando >= 0 && comando <= 18) s->redesenhar = true;
    if (comando >= 0 && comando <= 10) {
        TRY(Digitar(s->entrada, comando, s->nova));
        s->nova = s->tem_ultimo = false;
    }
    if (comando == 16) TRY(Sinal(s->entrada));
    if (comando == 18) {
        TRY(Apagar(s->entrada, s->nova));
        s->nova = s->tem_ultimo = false;
    }
    if (comando >= 11 && comando <= 14) {
        TRY(Valor(tom_text_data(s->entrada), &direito));
        if (s->pendente && !s->nova) TRY(Calcular(s->pendente, s->acumulador, direito, &s->acumulador));
        else if (!s->pendente) TRY(tom_decimal_copy(direito, &s->acumulador));
        TRY(tom_decimal_format(s->acumulador, s->entrada));
        s->pendente = comando;
        s->nova = true;
        s->tem_ultimo = false;
    }
    if (comando == 15) {
        TRY(Valor(tom_text_data(s->entrada), &direito));
        if (s->pendente) {
            TRY(Calcular(s->pendente, s->acumulador, direito, &s->acumulador));
            TRY(tom_decimal_copy(direito, &s->ultimo_direito));
            s->ultimo_operador = s->pendente;
            s->tem_ultimo = true;
            s->pendente = 0;
        } else if (s->tem_ultimo) {
            TRY(Calcular(s->ultimo_operador, direito, s->ultimo_direito, &s->acumulador));
        } else TRY(tom_decimal_copy(direito, &s->acumulador));
        TRY(tom_decimal_format(s->acumulador, s->entrada));
        s->nova = true;
    }
cleanup:
    tom_decimal_free(direito);
    return error;
}

static int32_t Evento(Calculadora *s) {
    int32_t error = 0, tipo, comando = -1, codigo, x;
    uint64_t quantidade = 1;
    TomText *texto = NULL;
    TRY(tom_event_wait(s->janela, s->evento));
    TRY(tom_event_field(s->evento, 0, &tipo));
    if (tipo == 1) { s->executar = false; goto cleanup; }
    if (tipo >= 5) { s->redesenhar = true; goto cleanup; }
    TRY(tom_text_new(256, "", &texto));
    if (tipo == 2) {
        TRY(tom_event_text(s->evento, texto));
        TRY(tom_text_characters(tom_text_data(texto), &quantidade));
    }
    if (tipo == 3) {
        TRY(tom_event_field(s->evento, 4, &codigo));
        if (codigo < 32) comando = Comando(codigo);
    }
    if (tipo == 4) {
        TRY(tom_event_field(s->evento, 3, &codigo));
        if (codigo == 1) {
            TRY(tom_event_field(s->evento, 1, &x));
            TRY(tom_event_field(s->evento, 2, &codigo));
            comando = Posicao(x, codigo);
        }
    }
    for (uint64_t i = 0; i < quantidade; i++) {
        if (tipo == 2) {
            TRY(tom_text_codepoint(tom_text_data(texto), i, &codigo));
            comando = Comando(codigo);
        }
        TRY(Processar(s, comando));
    }
cleanup:
    tom_text_free(texto);
    return error;
}

int main(void) {
    Calculadora s = {0};
    int32_t error = 0;
    TRY(tom_window_new("Calculadora Tom", 480, 640, &s.janela));
    TRY(tom_font_new(26, &s.grande));
    TRY(tom_font_new(12, &s.pequena));
    TRY(tom_font_new(15, &s.visor));
    TRY(tom_event_new(&s.evento));
    TRY(tom_text_new(128, "0", &s.entrada));
    TRY(tom_text_new(256, "", &s.mensagem));
    TRY(tom_decimal_parse("0", &s.acumulador));
    TRY(tom_decimal_parse("0", &s.ultimo_direito));
    s.nova = s.executar = s.redesenhar = true;
    while (s.executar) {
        if (s.redesenhar) {
            TRY(Desenhar(&s)); /* Like Tom, drawing is outside the event catch. */
            s.redesenhar = false;
        }
        error = Evento(&s);
        if (error) {
            const char *message = tom_error_message(error);
            TRY(tom_text_set(s.mensagem, message));
            TRY(tom_text_set(s.entrada, "Erro"));
            s.com_erro = s.nova = s.redesenhar = true;
            s.tem_ultimo = false;
            s.pendente = 0;
        }
    }
cleanup:
    tom_decimal_free(s.ultimo_direito);
    tom_decimal_free(s.acumulador);
    tom_text_free(s.mensagem);
    tom_text_free(s.entrada);
    tom_event_free(s.evento);
    tom_font_free(s.visor);
    tom_font_free(s.pequena);
    tom_font_free(s.grande);
    tom_window_free(s.janela);
    if (error) fprintf(stderr, "%s\n", tom_error_message(error));
    return error ? 1 : 0;
}
