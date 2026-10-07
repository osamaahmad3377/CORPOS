<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validated = Validator::make($request->all(), [
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ])->validate();

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if ($user->locked_until && $user->locked_until->isFuture()) {
            throw ValidationException::withMessages([
                'email' => ["Account locked. Try again after {$user->locked_until->diffForHumans()}."],
            ]);
        }

        if (! Hash::check($validated['password'], $user->password)) {
            $user->increment('failed_login_attempts');

            if ($user->failed_login_attempts >= config('pos.login_lockout_max_attempts')) {
                $user->update([
                    'locked_until' => now()->addMinutes(config('pos.login_lockout_minutes')),
                    'failed_login_attempts' => 0,
                ]);
            }

            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated.'],
            ]);
        }

        $user->update([
            'failed_login_attempts' => 0,
            'locked_until' => null,
            'last_login_at' => now(),
        ]);

        $token = $user->createToken('pos-token')->plainTextToken;

        ActivityLogger::log($user, 'login', 'auth', "User {$user->email} logged in.");

        return response()->json([
            'user' => new UserResource($user->load('role.permissions')),
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        $request->user()->currentAccessToken()->delete();

        ActivityLogger::log($user, 'logout', 'auth', "User {$user->email} logged out.");

        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request)
    {
        return new UserResource($request->user()->load('role.permissions'));
    }

    public function updateProfile(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $user->update($validated);

        return new UserResource($user->load('role.permissions'));
    }

    public function changePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', Password::min(8)->mixedCase()->numbers(), 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => Hash::make($validated['new_password'])]);

        // A changed password should immediately invalidate any other active
        // session — otherwise a token stolen before the change stays valid
        // indefinitely, defeating the point of changing the password.
        $currentTokenId = $user->currentAccessToken()?->id;
        $user->tokens()->when($currentTokenId, fn ($q) => $q->where('id', '!=', $currentTokenId))->delete();

        ActivityLogger::log($user, 'change_password', 'auth', "User {$user->email} changed their password.");

        return response()->json(['message' => 'Password changed successfully.']);
    }
}
