'use strict';
// Ownership and constructor dependencies are shared by the checker and emitter.
const resources = {
  DialogoArquivo: {free:'tom_file_dialog_free'},
  Formulario: {free:'tom_form_free',owner:'Janela'},
  TrabalhoArquivo: {free:'tom_file_job_free'},
  DocumentoTexto: { free: 'tom_document_free' },
  EditorTexto: { free: 'tom_editor_free', owner: 'Janela' },
  PersistenciaDocumentoSQLite: { free: 'tom_document_store_free', owner: 'DocumentoTexto' },
  Texto: { free: 'tom_text_free' },
  BancoSQLite: { free: 'tom_sqlite_free' },
  ConsultaSQLite: { free: 'tom_sqlite_statement_free', owner: 'BancoSQLite' },
  TransacaoSQLite: { free: 'tom_sqlite_transaction_free', owner: 'BancoSQLite' },
  CanalMensagens: { free: 'tom_channel_free' },
  Janela: { free: 'tom_window_free' }, Fonte: { free: 'tom_font_free' },
  Evento: { free: 'tom_event_free' }, Sorteador: { free: 'tom_random_free' },
  Visual: { free: 'tom_visual_free', owner: 'Janela' },
  Audio: { free: 'tom_audio_free' }, Som: { free: 'tom_sound_free', owner: 'Audio' },
  DadosUsuario: { free: 'tom_data_free' }, Json: { free: 'tom_json_free' },
  CatalogoVisual: { free: 'tom_visual_catalog_free', owner: 'Janela' },
  CatalogoSom: { free: 'tom_sound_catalog_free', owner: 'Audio' },
};
const RESOURCE_PATTERN = Object.keys(resources).join('|');
module.exports = { resources, RESOURCE_PATTERN };
