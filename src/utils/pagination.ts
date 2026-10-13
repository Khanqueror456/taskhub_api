import { z } from "zod";

export const offsetQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cursorQuery = z.object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function offsetMeta(page: number, limit: number, total: number)
{
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
};

// Pass rows fetched with `take: limit + 1`; the extra row tells us there is a next page.

export function cursorPage<T extends { id: string }>(rows: T[], limit: number) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return {
        data,
        pagination: { limit, hasMore, nextCursor: hasMore ? data[data.length - 1].id : null},
    }
}