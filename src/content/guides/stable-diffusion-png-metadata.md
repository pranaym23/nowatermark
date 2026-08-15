---
title: How to Extract Stable Diffusion Prompts and Settings From PNG Images
metaTitle: 'Extract Stable Diffusion Prompts From PNG | NoWatermark'
description: Learn how Stable Diffusion stores prompts, seeds, and samplers in PNG text chunks, how to extract or strip them losslessly, and protect your privacy.
summary: Stable Diffusion embeds your full prompt, seed, sampler, and model hash inside PNG text chunks — here is how to view or remove them without quality loss.
publishDate: 2026-08-14
order: 32
relatedTools: ['/ai-metadata-remover', '/ai-watermark-checker']
relatedGuides: ['/guides/how-to-check-ai-image-metadata', '/guides/can-you-remove-ai-watermarks']
faq:
  - q: Does a Stable Diffusion PNG contain my full prompt?
    a: Yes. Most SD web UIs write the complete positive prompt, negative prompt, seed, sampler, CFG scale, steps, and model hash into a text chunk named parameters inside the PNG container.
  - q: Does converting a PNG to JPG remove the Stable Diffusion prompt?
    a: Converting PNG to JPG strips PNG text chunks, but standard image converters often re-encode and compress the picture, reducing quality. Our AI Metadata Remover drops text chunks losslessly without recompression.
  - q: Can I extract prompts without uploading my images to a server?
    a: Yes. Drop the image into NoWatermark's AI Watermark Checker. Parsing happens in your browser via local JavaScript.
---

When you generate an image using Stable Diffusion, the output PNG file almost always carries your exact positive prompt, negative prompt, random seed, sampler settings, CFG scale, and model hash embedded directly inside the file container. Web interfaces such as Automatic1111, SD.Next, ComfyUI, Forge, and InvokeAI automatically write this generation data into PNG text chunks during image creation. Extracting a stable diffusion prompt from png files requires no specialized desktop software, and stripping those prompts to protect your workflow can be accomplished in seconds without re-encoding your image pixels.

## Where Stable Diffusion Hides Prompts Inside PNG Files

Portable Network Graphics (PNG) files are structured into discrete data blocks known as **chunks**. While the main image content is stored in compressed `IDAT` chunks, the PNG specification allows applications to store arbitrary text key-value pairs in ancillary text chunks named `tEXt`, `zTXt` (compressed text), and `iTXt` (international UTF-8 text).

When Stable Diffusion generates an image, the user interface acts as a PNG encoder. Before writing the end-of-file `IEND` marker, it injects a text chunk containing key generation parameters.

Because these text chunks live outside the compressed pixel data (`IDAT`), they are completely invisible when viewing the picture in standard image viewers or web browsers. However, any tool that parses PNG container structures can read every character of text stored inside them.

This metadata architecture provides a significant advantage for creators who want to reproduce or archive their generations. However, it also creates privacy exposures when raw PNG files are uploaded to forums, portfolio sites, or public galleries without pre-cleaning.

## The parameters Chunk: Prompts, Seeds, Samplers, and Model Hashes

In the widely adopted Automatic1111 web UI ecosystem, Stable Diffusion parameters are written into a single `tEXt` or `iTXt` chunk where the key name is explicitly defined as `parameters`.

The value of this chunk is formatted as a structured plain-text block divided into three distinct sections:

1. **Positive Prompt:** The full text string entered in the prompt box, including weight syntax (e.g., `(masterpiece:1.2), detailed portrait of a cyberpunk explorer`).
2. **Negative Prompt:** Preceded by the label `Negative prompt:`, listing all excluded concepts and quality embeddings.
3. **Parameter String:** A final line comma-separated key-value list containing exact technical execution parameters:
   - `Steps`: Number of denoising sampling steps (e.g., `30`).
   - `Sampler`: The sampling algorithm (e.g., `Euler a`, `DPM++ 2M Karras`).
   - `CFG scale`: Classifier-Free Guidance scale (e.g., `7`).
   - `Seed`: The exact 64-bit integer random seed.
   - `Size`: Original canvas dimensions (e.g., `512x768` or `1024x1024`).
   - `Model hash`: The truncated SHA256 checksum of the checkpoint model file.
   - `Model`: The human-readable checkpoint name (e.g., `v1-5-pruned-emaonly` or `SDXL_turbo`).
   - `Denoising strength`: If Highres.fix or img2img was used.
   - `Lora hashes`: Checksums and weights for any LoRA fine-tuning networks applied.

This detailed payload means that anyone who obtains your raw PNG file can inspect your exact setup, down to the specific LoRA weights and negative prompt triggers used to construct the image.

## How Automatic1111, Forge, and InvokeAI Store Generation Data

While Automatic1111 established the `parameters` chunk standard, different Stable Diffusion web user interfaces and node-based setups format and store generation metadata slightly differently:

### Automatic1111 and WebUI Forge
Both Automatic1111 and Forge use the standard `parameters` key in `tEXt` or `iTXt` chunks. They also write software declaration headers into `Software` chunks (typically set to `Automatic1111` or `Forge`).

### InvokeAI
InvokeAI stores generation history using JSON strings inside custom PNG metadata keys. Rather than a single `parameters` block, InvokeAI writes an `invokeai` chunk containing a structured JSON object. This JSON details the node pipeline, model parameters, seed, and prompt invocation tree.

### ComfyUI
ComfyUI takes a node-graph approach and writes two distinct JSON chunks into PNG outputs:
- `prompt`: Contains the raw API-level execution graph submitted to the Python backend.
- `workflow`: Contains the complete visual UI layout, node coordinates, custom node names, and connected wires.

For a detailed breakdown of node graph metadata, refer to our dedicated guide on [ComfyUI workflow metadata](/guides/comfyui-workflow-metadata).

## Why Sharing PNGs Can Unintentionally Leak Your Full Workflow

Storing generation data inside PNG files is immensely helpful during local creation, but public distribution of uncleaned files presents several privacy and competitive risks:

- **Proprietary Prompt Leakage:** Prompt engineers and digital artists who spend hours refining complex prompt structures, weighting syntax, and negative prompt combinations lose their edge when raw PNGs are published directly online.
- **Exposure of Local File Paths:** Certain custom nodes and older UI extensions store local file directory paths (e.g., `C:\Users\Username\StableDiffusion\models\Lora\secret_style.safetensors`) inside text metadata chunks, inadvertently revealing local computer usernames and folder structures.
- **Embedded API Keys or IP Addresses:** In custom API workflow integrations, misconfigured logging nodes have occasionally written backend server IP addresses or internal API keys directly into output image text fields.
- **Misclassification as Human Artwork:** If you submit AI-generated artwork to platforms or competitions that prohibit generative media, embedded PNG metadata provides instant, definitive proof of AI origin.

However, it is equally important to remember a core principle of metadata security: **the absence of metadata is not proof of human creation.** Social media platforms, image compression routines, and screenshots routinely strip PNG text chunks. While stripping metadata removes embedded parameters, it does not alter the underlying pixel distribution.

## How to Extract or Strip Stable Diffusion Metadata Locally

You do not need to install complex Python scripts, heavy web UIs, or cloud-based conversion utilities to extract or wipe Stable Diffusion prompts from your PNG files.

### 1. Extracting Prompts Safely in Your Browser
To inspect the hidden parameters in any PNG image without uploading the file to an external server:
1. Open our [AI Watermark Checker](/ai-watermark-checker).
2. Drag and drop your PNG file into the scanner window.
3. The scanner parses the file container locally in web worker memory and displays the full `parameters`, `prompt`, or `workflow` text blocks in plain readable text.

### 2. Stripping Prompts Losslessly Without Quality Loss
Many creators attempt to remove prompts by opening the PNG in an image editor and re-saving it as a JPEG or WebP file. While this discards PNG text chunks, JPEG conversion is a lossy process that decodes pixels, applies lossy compression, and permanently degrades visual quality.

Our [AI Metadata Remover](/ai-metadata-remover) operates entirely at the container level:
- It locates `tEXt`, `iTXt`, and `zTXt` chunks inside the PNG file structure.
- It rewrites the PNG container without those text chunks.
- It leaves the core pixel data (`IDAT` chunks) completely untouched and bit-identical.

After cleaning, the tool automatically re-scans the file to verify that the `parameters` chunk is no longer present.

### Legal Notice on Metadata Modification
While stripping metadata from your own Stable Diffusion creations is a standard practice for workflow privacy, removing author attribution, copyright declarations, or provenance tags from artwork created by others may infringe upon intellectual property laws or platform agreements. Ensure you possess the rights to modify image metadata prior to distribution.

To inspect or clean your Stable Diffusion images losslessly and privately, try our zero-upload [AI Metadata Remover](/ai-metadata-remover). To learn more about how different formats hold metadata, explore our guide on [how to check AI image metadata](/guides/how-to-check-ai-image-metadata).
