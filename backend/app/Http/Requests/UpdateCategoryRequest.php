<?php

namespace App\Http\Requests;

use App\Models\Category;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $category = $this->route('category');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('categories', 'slug')->ignore($category)],
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                'exists:categories,id',
                Rule::notIn([$category?->id]),
                function ($attribute, $value, $fail) use ($category) {
                    // Direct self-parenting is already blocked above; this
                    // catches the indirect case — making this category a
                    // descendant of its own descendant (e.g. A's parent
                    // becomes B when B's parent is already A) — which would
                    // otherwise silently create a cycle in the tree.
                    if (! $category || ! $value) {
                        return;
                    }

                    $ancestorId = $value;
                    $depth = 0;
                    while ($ancestorId !== null && $depth < 50) {
                        if ((int) $ancestorId === $category->id) {
                            $fail('This would create a circular category hierarchy.');

                            return;
                        }
                        $ancestorId = Category::where('id', $ancestorId)->value('parent_id');
                        $depth++;
                    }
                },
            ],
            'image' => ['sometimes', 'nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'parent_id.not_in' => 'A category cannot be its own parent.',
        ];
    }
}
