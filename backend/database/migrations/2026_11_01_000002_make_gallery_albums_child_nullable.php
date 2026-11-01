<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('gallery_albums')) {
            return;
        }

        Schema::disableForeignKeyConstraints();

        $rows = DB::table('gallery_albums')->get()->map(fn ($row) => (array) $row)->all();
        $photos = Schema::hasTable('gallery_photos')
            ? DB::table('gallery_photos')->get()->map(fn ($row) => (array) $row)->all()
            : [];

        Schema::dropIfExists('gallery_photos');
        Schema::dropIfExists('gallery_albums');

        Schema::create('gallery_albums', function (Blueprint $table) {
            $table->id();
            $table->foreignId('child_id')->nullable()->constrained('children')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name');
            $table->timestamps();

            $table->index(['child_id', 'name']);
        });

        Schema::create('gallery_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_album_id')->constrained('gallery_albums')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('original_filename');
            $table->string('mime_type', 127)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('disk', 64)->default('local');
            $table->string('file_path');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        foreach ($rows as $row) {
            DB::table('gallery_albums')->insert($row);
        }
        foreach ($photos as $row) {
            DB::table('gallery_photos')->insert($row);
        }

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Irreversible without forcing child_id values; leave nullable.
    }
};
