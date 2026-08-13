/**
 * XMP extraction.
 *
 * XMP is RDF/XML. We deliberately do not use DOMParser: it is unavailable in a
 * plain Worker scope, it is a much larger attack surface for hostile input,
 * and we only need a handful of scalar properties. Values are extracted as
 * text and sanitised before display — the XML itself is never rendered.
 */

import { describeDigitalSourceType, matchGenerator } from './generators';

export interface XmpData {
  creatorTool?: string;
  creator?: string;
  rights?: string;
  createDate?: string;
  modifyDate?: string;
  title?: string;
  description?: string;
  /** Raw DigitalSourceType URI, when present. */
  digitalSourceType?: string;
  digitalSourceLabel?: string;
  /** True when DigitalSourceType indicates generative AI. */
  indicatesAi: boolean;
  /** Generator name inferred from CreatorTool or other fields. */
  generator?: string;
  /** XMP namespace URIs declared in the packet. */
  namespaces: string[];
  /** The packet mentions C2PA / Content Credentials structures. */
  mentionsC2pa: boolean;
  /** Approximate size of the packet in bytes. */
  byteLength: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip tags and decode the handful of entities XMP actually uses. */
function textContent(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read a property by local name, ignoring the namespace prefix.
 * Handles attribute form, element form, and rdf:Alt / rdf:Seq wrappers.
 */
function pick(xml: string, localName: string): string | undefined {
  const ln = escapeRe(localName);

  // Attribute form: xmp:CreatorTool="Photoshop"
  const attr = new RegExp(`(?:\\s|^)(?:[A-Za-z0-9_-]+:)?${ln}\\s*=\\s*"([^"]*)"`, 'i').exec(xml);
  if (attr?.[1]) {
    const v = textContent(attr[1]);
    if (v) return v;
  }

  // Element form, possibly wrapping rdf:Alt / rdf:Seq / rdf:Bag.
  const el = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${ln}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${ln}>`,
    'i',
  ).exec(xml);
  if (el?.[1]) {
    const inner = el[1];
    const li = /<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/i.exec(inner);
    const v = textContent(li?.[1] ?? inner);
    if (v) return v;
  }

  // Self-closing element carrying an rdf:resource, used by DigitalSourceType.
  const res = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${ln}(?:\\s[^>]*?)?rdf:resource\\s*=\\s*"([^"]*)"`,
    'i',
  ).exec(xml);
  if (res?.[1]) return textContent(res[1]);

  return undefined;
}

export function parseXmp(xml: string): XmpData {
  const namespaces = Array.from(
    new Set(Array.from(xml.matchAll(/xmlns:[A-Za-z0-9_-]+\s*=\s*"([^"]+)"/g), (m) => m[1]!)),
  );

  const digitalSourceType = pick(xml, 'DigitalSourceType');
  const described = digitalSourceType ? describeDigitalSourceType(digitalSourceType) : undefined;
  const creatorTool = pick(xml, 'CreatorTool');

  const generator =
    matchGenerator(creatorTool) ??
    matchGenerator(pick(xml, 'Software')) ??
    matchGenerator(pick(xml, 'claim_generator')) ??
    matchGenerator(pick(xml, 'Model'));

  return {
    creatorTool,
    creator: pick(xml, 'creator'),
    rights: pick(xml, 'rights'),
    createDate: pick(xml, 'CreateDate'),
    modifyDate: pick(xml, 'ModifyDate'),
    title: pick(xml, 'title'),
    description: pick(xml, 'description'),
    digitalSourceType,
    digitalSourceLabel: described?.label,
    indicatesAi: described?.ai ?? false,
    generator,
    namespaces,
    mentionsC2pa: /c2pa|contentcredentials|content credentials/i.test(xml),
    byteLength: xml.length,
  };
}

/** JPEG APP1 XMP packet identifiers. */
export const XMP_NAMESPACE_ID = 'http://ns.adobe.com/xap/1.0/\0';
export const XMP_EXTENSION_ID = 'http://ns.adobe.com/xmp/extension/\0';
/** PNG iTXt keyword carrying an XMP packet. */
export const XMP_PNG_KEYWORD = 'XML:com.adobe.xmp';
