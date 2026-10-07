import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// Categories with a display path ("Staples › Rice"), sorted by that path.
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories'),
    select: (res) => {
      const rows = res?.data || [];
      const byId = Object.fromEntries(rows.map((c) => [c.id, c]));
      return rows
        .map((c) => ({ ...c, path: c.parent_id && byId[c.parent_id] ? `${byId[c.parent_id].name} › ${c.name}` : c.name }))
        .sort((a, b) => a.path.localeCompare(b.path));
    },
    staleTime: 60_000,
  });
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: () => api.get('/brands'), select: (res) => res?.data || [], staleTime: 60_000 });
}

export function imageUrl(img) {
  return img?.image_path ? `/storage/${img.image_path}` : null;
}

export function primaryImage(product) {
  const imgs = product?.images || [];
  return imageUrl(imgs.find((i) => i.is_primary) || imgs[0]);
}
