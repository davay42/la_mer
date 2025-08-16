import {
  defineConfig,
  transformerDirectives,
  presetIcons,
  presetUno,
  extractorSplit,
  presetTypography
} from "unocss";
import extractorPug from "@unocss/extractor-pug";

export default defineConfig(
  {
    transformers: [transformerDirectives()],
    presets: [
      presetIcons({
        scale: 1.2,
        extraProperties: {
          "vertical-align": "middle",
        },
      }),
      presetUno(),
      presetTypography(),
    ],
    extractors: [extractorSplit, extractorPug()],
  })