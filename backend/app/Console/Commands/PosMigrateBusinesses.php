<?php

namespace App\Console\Commands;

use App\Support\Businesses;
use Illuminate\Console\Command;

/** After an app update: bring every extra business database up to date. */
class PosMigrateBusinesses extends Command
{
    protected $signature = 'pos:migrate-businesses';

    protected $description = 'Run new database updates on every business on this computer';

    public function handle(): int
    {
        $failed = 0;
        foreach (array_keys(Businesses::all()) as $id) {
            if ($id === Businesses::HOME) {
                continue; // the launcher migrates the home database itself
            }
            try {
                Businesses::migrate($id);
                $this->line("business {$id}: up to date");
            } catch (\Throwable $e) {
                $failed++;
                $this->error("business {$id}: {$e->getMessage()}");
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
