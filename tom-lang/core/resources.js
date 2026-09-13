'use strict';
// Ownership and constructor dependencies are shared by the checker and emitter.
const resources = {
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
