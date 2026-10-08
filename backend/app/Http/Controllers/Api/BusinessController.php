<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Support\Businesses;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Several businesses on one computer (e.g. a mart and a restaurant), each
 * with its own items, bills, customers, staff, settings and logo.
 */
class BusinessController extends Controller
{
    /** Names and logos only — for the business picker on the sign-in page. */
    public function publicList()
    {
        $list = [];
        foreach (Businesses::all() as $id => $path) {
            $s = Businesses::summary($id, $path);
            $list[] = array_intersect_key($s, array_flip(['id', 'name', 'type_label', 'logo_url', 'brand_color']));
        }

        return response()->json(['data' => $list]);
    }

    public function index(Request $request)
    {
        $email = $request->user()->email;
        $list = [];
        foreach (Businesses::all() as $id => $path) {
            $list[] = Businesses::summary($id, $path) + [
                'current' => $id === Businesses::current(),
                'can_open' => $id === Businesses::current() || Businesses::hasUser($path, $email),
            ];
        }

        return response()->json(['data' => $list, 'current' => Businesses::current()]);
    }

    /** Sign the same person in to another business (same email there). */
    public function switch(Request $request, int $business)
    {
        $email = $request->user()->email;
        $path = Businesses::path($business);
        if (! $path) {
            abort(404, 'This business was not found on this computer.');
        }
        if (! Businesses::hasUser($path, $email)) {
            abort(403, 'You do not have an account in that business. Ask the owner to add you there.');
        }

        Businesses::migrate($business);

        return Businesses::within($business, function () use ($email) {
            $user = User::whereRaw('lower(email) = ?', [strtolower($email)])->where('is_active', true)->firstOrFail();
            $user->update(['last_login_at' => now()]);
            ActivityLogger::log($user, 'login', 'auth', "Switched in to this business as {$user->email}.");

            return response()->json([
                'token' => $user->createToken('pos-token')->plainTextToken,
                'user' => new UserResource($user->load('role.permissions')),
            ]);
        });
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', Rule::in(array_keys(config('pos.business_types')))],
        ]);
        if (count(Businesses::all()) >= 10) {
            throw ValidationException::withMessages(['name' => 'At most 10 businesses on one computer.']);
        }

        // The owner (and the other admins) can open the new business with
        // their usual email and password; other staff are added there.
        $adminRole = Role::where('name', 'Admin')->value('id');
        $people = User::where('is_active', true)
            ->where(fn ($q) => $q->where('id', $request->user()->id)->orWhere('role_id', $adminRole))
            ->pluck('id')->all();

        $id = Businesses::create($data['name'], $data['type'], $people);
        ActivityLogger::log($request->user(), 'create', 'businesses', "Added business \"{$data['name']}\".");

        return response()->json(['data' => Businesses::summary($id, Businesses::path($id))], 201);
    }

    /** Take a business off the list. Its data file is kept in "removed". */
    public function destroy(Request $request, int $business)
    {
        $path = Businesses::path($business);
        if (! $path) {
            abort(404, 'This business was not found on this computer.');
        }
        if ($business === Businesses::HOME) {
            abort(422, 'The first business cannot be removed.');
        }
        if ($business === Businesses::current()) {
            abort(422, 'Switch to another business first, then remove this one.');
        }
        $name = Businesses::summary($business, $path)['name'];
        $request->validate(['confirm' => ['required', 'string', fn ($a, $v, $fail) => mb_strtolower(trim($v)) === mb_strtolower($name) ? null : $fail('Type the business name exactly to confirm.')]]);

        Businesses::home()->table('businesses')->where('id', $business)->delete();
        $archive = Businesses::dir().DIRECTORY_SEPARATOR.'removed';
        if (! is_dir($archive)) {
            mkdir($archive, 0775, true);
        }
        foreach (['', '-wal', '-shm'] as $suffix) {
            if (is_file($path.$suffix)) {
                rename($path.$suffix, $archive.DIRECTORY_SEPARATOR.now()->format('Ymd_His_').basename($path).$suffix);
            }
        }
        ActivityLogger::log($request->user(), 'delete', 'businesses', "Removed business \"{$name}\" (data file kept in businesses/removed).");

        return response()->json(['ok' => true]);
    }
}
