//! Remover fundo com o modelo U²-Netp (Apache-2.0), rodando localmente com o
//! tract (Rust puro, sem bibliotecas nativas). Nada sai do computador.

use std::{
    io::Cursor,
    sync::{Arc, OnceLock},
};

use image::{imageops::FilterType, ImageBuffer, Luma, RgbImage, RgbaImage};
use tract_onnx::prelude::*;

type Model = Arc<TypedSimplePlan>;

/// O modelo vai dentro do executável (cerca de 4,5 MB).
static MODEL: &[u8] = include_bytes!("../models/u2netp.onnx");

/// Lado da imagem que o modelo espera.
const SIDE: u32 = 320;
const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const STD: [f32; 3] = [0.229, 0.224, 0.225];

/// O modelo é preparado no primeiro uso (leva alguns décimos de segundo) e reaproveitado.
fn model() -> Result<&'static Model, String> {
    static MODEL_CACHE: OnceLock<Result<Model, String>> = OnceLock::new();
    MODEL_CACHE
        .get_or_init(|| {
            let load = || -> TractResult<Model> {
                tract_onnx::onnx()
                    .model_for_read(&mut Cursor::new(MODEL))?
                    .with_input_fact(0, f32::fact([1, 3, SIDE as usize, SIDE as usize]).into())?
                    .into_optimized()?
                    .into_runnable()
            };
            load().map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|e| format!("Não foi possível carregar o modelo de remoção de fundo: {e}"))
}

/// Devolve a máscara (um byte por pixel, 255 = objeto, 0 = fundo) no tamanho da imagem.
pub fn mask(rgba: RgbaImage) -> Result<Vec<u8>, String> {
    let (width, height) = rgba.dimensions();
    let rgb: RgbImage = image::DynamicImage::ImageRgba8(rgba).to_rgb8();
    let small = image::imageops::resize(&rgb, SIDE, SIDE, FilterType::Triangle);

    // Mesmo pré-processamento do rembg: divide pelo maior valor e normaliza por canal.
    let max = small.as_raw().iter().copied().max().unwrap_or(255).max(1) as f32;
    let plane = (SIDE * SIDE) as usize;
    let mut input = vec![0f32; 3 * plane];
    for (i, pixel) in small.pixels().enumerate() {
        for c in 0..3 {
            input[c * plane + i] = (pixel[c] as f32 / max - MEAN[c]) / STD[c];
        }
    }

    let tensor = Tensor::from_shape(&[1, 3, SIDE as usize, SIDE as usize], &input).map_err(|e| e.to_string())?;
    let outputs = model()?.run(tvec!(tensor.into())).map_err(|e| e.to_string())?;
    let output = outputs[0].try_as_plain_ram().map_err(|e| e.to_string())?;
    let prediction = output.as_slice::<f32>().map_err(|e| e.to_string())?;
    let prediction = &prediction[..plane];

    // Normaliza a saída para 0..1, como o rembg, e amplia até o tamanho original.
    let (lo, hi) = prediction
        .iter()
        .fold((f32::MAX, f32::MIN), |(lo, hi), &v| (lo.min(v), hi.max(v)));
    let range = (hi - lo).max(1e-6);
    let small_mask: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::from_fn(SIDE, SIDE, |x, y| {
        let v = (prediction[(y * SIDE + x) as usize] - lo) / range;
        Luma([(v * 255.0).round().clamp(0.0, 255.0) as u8])
    });
    Ok(image::imageops::resize(&small_mask, width, height, FilterType::Triangle).into_raw())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Um círculo escuro no meio de um fundo branco: o centro precisa ficar
    /// na máscara e os cantos fora.
    #[test]
    fn separa_objeto_do_fundo() {
        let img = RgbaImage::from_fn(400, 300, |x, y| {
            let (dx, dy) = (x as f32 - 200.0, y as f32 - 150.0);
            if dx * dx + dy * dy < 90.0 * 90.0 {
                image::Rgba([200, 40, 30, 255])
            } else {
                image::Rgba([255, 255, 255, 255])
            }
        });
        let started = std::time::Instant::now();
        let mask = mask(img).expect("modelo rodou");
        eprintln!("tempo: {:?}", started.elapsed());
        assert_eq!(mask.len(), 400 * 300);
        let at = |x: usize, y: usize| mask[y * 400 + x];
        eprintln!("centro {} canto {}", at(200, 150), at(5, 5));
        assert!(at(200, 150) > 200);
        assert!(at(5, 5) < 50);
    }
}
