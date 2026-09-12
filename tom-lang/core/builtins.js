'use strict';
// One typed ABI contract shared by parsing, checking and LLVM emission.
const builtins = {
  LimparTxt: { c: 'tom_text_clear', args: ['RefBuffer'], result: 'Vazio', lib: 'text' },
  CopiarTxt: { c: 'tom_text_set', args: ['RefBuffer', 'Txt'], result: 'Vazio', lib: 'text' },
  AnexarTxt: { c: 'tom_text_append', args: ['RefBuffer', 'Txt'], result: 'Vazio', lib: 'text' },
  ApagarTxt: { c: 'tom_text_pop', args: ['RefBuffer'], result: 'Vazio', lib: 'text' },
  ComprimentoTxt: { c: 'tom_text_length', args: ['Buffer'], result: 'InUd64', lib: 'text' },
  TextoParaDc34: { c: 'tom_decimal_parse', args: ['Txt'], result: 'Dc34', lib: 'decimal' },
  Dc34ParaTexto: { c: 'tom_decimal_format', args: ['Dc34', 'RefBuffer'], result: 'Vazio', lib: 'decimal' },
  TrocarCaractereTxt: { c: 'tom_text_replace_ascii', args: ['RefBuffer', 'InSd32', 'InSd32'], result: 'Vazio', lib: 'text' },
  CodigoCaractereTxt: { c: 'tom_text_codepoint', args: ['Txt', 'InUd64'], result: 'InSd32', lib: 'text' },
  QuantidadeCaracteresTxt: { c: 'tom_text_characters', args: ['Txt'], result: 'InUd64', lib: 'text' },
  RecortarTxt: { c: 'tom_text_slice', args: ['RefBuffer', 'Txt', 'InUd64', 'InUd64'], result: 'Vazio', lib: 'text' },
  InteiroParaTexto: { c: 'tom_integer_format', args: ['InSd32', 'RefBuffer'], result: 'Vazio', lib: 'text' },
  JanelaCriar: { c: 'tom_window_new', args: ['Txt', 'InSd32', 'InSd32'], result: 'Janela', lib: 'ui' },
  FonteCarregar: { c: 'tom_font_new', args: ['InSd32'], result: 'Fonte', lib: 'ui' },
  EventoCriar: { c: 'tom_event_new', args: [], result: 'Evento', lib: 'ui' },
  EventoAguardar: { c: 'tom_event_wait', args: ['Janela', 'RefEvento'], result: 'Vazio', lib: 'ui' },
  EventoConsultar: { c: 'tom_event_poll', args: ['Janela', 'RefEvento'], result: 'Bl', lib: 'ui' },
  EventoCampo: { c: 'tom_event_field', args: ['Evento', 'InSd32'], result: 'InSd32', lib: 'ui' },
  EventoTexto: { c: 'tom_event_text', args: ['Evento', 'RefBuffer'], result: 'Vazio', lib: 'ui' },
  JanelaLimpar: { c: 'tom_window_clear', args: ['RefJanela', 'InUd32'], result: 'Vazio', lib: 'ui' },
  DesenharRetangulo: { c: 'tom_draw_rect', args: ['RefJanela', 'InSd32', 'InSd32', 'InSd32', 'InSd32', 'InUd32'], result: 'Vazio', lib: 'ui' },
  DesenharTexto: { c: 'tom_draw_text', args: ['RefJanela', 'Fonte', 'Txt', 'InSd32', 'InSd32', 'InUd32'], result: 'Vazio', lib: 'ui' },
  MedirTexto: { c: 'tom_measure_text', args: ['Fonte', 'Txt'], result: 'InSd32', lib: 'ui' },
  JanelaApresentar: { c: 'tom_window_present', args: ['RefJanela'], result: 'Vazio', lib: 'ui' },
};
module.exports = { builtins };
