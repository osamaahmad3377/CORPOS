<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $faker = fake();

        for ($i = 1; $i <= 20; $i++) {
            $phone = '03'.str_pad((string) (100000000 + $i), 9, '0', STR_PAD_LEFT);

            Customer::updateOrCreate(
                ['phone' => $phone],
                [
                    'name' => $faker->name(),
                    'email' => $faker->boolean(70) ? $faker->unique()->safeEmail() : null,
                    'address' => $faker->streetAddress(),
                    'city' => $faker->randomElement(['Karachi', 'Lahore', 'Islamabad', 'Faisalabad', 'Multan']),
                    'total_purchases' => 0,
                ]
            );
        }
    }
}
