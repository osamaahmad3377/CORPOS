<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Reservation extends Model
{
    public const STATUSES = ['booked', 'seated', 'done', 'cancelled', 'no_show'];

    protected $fillable = ['name', 'phone', 'guests', 'reserved_for', 'duration_minutes', 'table_no', 'status', 'notes', 'seated_at', 'created_by'];

    protected function casts(): array
    {
        return [
            'reserved_for' => 'datetime',
            'seated_at' => 'datetime',
            'guests' => 'integer',
            'duration_minutes' => 'integer',
        ];
    }
}
