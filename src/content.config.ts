import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * A cited source. `accessed` is the date we last looked at it, not the date it
 * was published: the point of recording it is that a reader can tell how stale
 * our reading of someone else's page might be.
 */
const source = z.object({
  title: z.string(),
  url: z.string().url(),
  accessed: z.coerce.date(),
});

/** One dated line of what changed. Newest first, by convention. */
const change = z.object({
  date: z.coerce.date(),
  note: z.string(),
});

/**
 * The five content types (V2 R19). They differ in what evidence they owe the
 * reader, which is why the type is frontmatter rather than a folder:
 *
 *   guide      — evergreen explanation
 *   lab        — a test we ran; owes `lastTested` and fixtures
 *   comparison — products or standards side by side; owes sources
 *   answer     — a short knowledge-hub answer to one question
 */
const contentType = z.enum(['guide', 'lab', 'comparison', 'answer']);

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z
    .object({
      title: z.string(),
      /** <title> tag; falls back to title. */
      metaTitle: z.string().optional(),
      description: z.string(),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      /** Short summary for index cards. */
      summary: z.string(),
      relatedTools: z.array(z.string()).default([]),
      relatedGuides: z.array(z.string()).default([]),
      faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
      order: z.number().default(50),

      contentType: contentType.default('guide'),
      /** Topic cluster this page belongs to (V2 R20). */
      cluster: z.string().optional(),

      /*
       * Authorship is a real person or the organisation, and nothing else. A
       * site whose product is honesty about limits does not invent an editorial
       * masthead to satisfy an SEO checklist. See build plan A4.
       */
      author: z.string().default('NoWatermark'),
      reviewer: z.string().optional(),

      /**
       * When the claims on this page were last verified against reality.
       * Required on `lab` and `comparison` pages, whose whole value is that the
       * reader can see how old the result is.
       */
      lastTested: z.coerce.date().optional(),

      sources: z.array(source).default([]),
      changelog: z.array(change).default([]),
    })
    .superRefine((data, ctx) => {
      if ((data.contentType === 'lab' || data.contentType === 'comparison') && !data.lastTested) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lastTested'],
          message: `A "${data.contentType}" page must carry a lastTested date. If the claim has not been tested, it is not a ${data.contentType}.`,
        });
      }
      if (data.contentType === 'lab' && data.sources.length === 0 && data.changelog.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources'],
          message: 'A lab report must cite its sources or record how the test was run.',
        });
      }
    }),
});

export const collections = { guides };
