<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;

class VerifyEmailNotification extends VerifyEmail
{
    public function toMail($notifiable): MailMessage
    {
        $verificationUrl = static::signedUrl($notifiable);

        return (new MailMessage)
            ->subject('Verify your SmartCare account')
            ->greeting('Hello '.$notifiable->name.'!')
            ->line('A SmartCare account was created for you. Please verify your email address before signing in.')
            ->line('This verification link expires in '.(int) Config::get('auth.verification.expire', 15).' minutes.')
            ->line('You can sign in with the username and password provided by your Head Doctor, or link your Google account after verification.')
            ->action('Verify email address', $verificationUrl)
            ->line('If you did not expect this email, you can ignore it.');
    }

    public static function signedUrl($notifiable): string
    {
        return URL::temporarySignedRoute(
            'verification.verify',
            Carbon::now()->addMinutes(Config::get('auth.verification.expire', 60)),
            [
                'id' => $notifiable->getKey(),
                'hash' => sha1($notifiable->getEmailForVerification()),
            ]
        );
    }

    protected function verificationUrl($notifiable): string
    {
        return static::signedUrl($notifiable);
    }
}
