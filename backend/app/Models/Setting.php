<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = [
        'key',
        'value',
        'group',
    ];

    public static function group(string $group)
    {
        return static::where('group', $group)->get()->pluck('value', 'key');
    }
}
