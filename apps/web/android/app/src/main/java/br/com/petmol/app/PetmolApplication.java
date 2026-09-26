package br.com.petmol.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

public class PetmolApplication extends Application {

    private static final String TAG = "PetmolApplication";

    // Mesmo id referenciado em AndroidManifest.xml
    // (com.google.firebase.messaging.default_notification_channel_id) — sem
    // o canal existir de fato (Android 8+ exige criação explícita), o FCM
    // cai no canal genérico "Miscellaneous" do sistema, e o tutor não
    // consegue silenciar/configurar os avisos do PETMOL separadamente dos
    // de outros apps. Achado na auditoria física de 19/09/2026 (logcat:
    // "Missing Default Notification Channel metadata in AndroidManifest").
    public static final String DEFAULT_NOTIFICATION_CHANNEL_ID = "petmol_default";

    // Canais com som próprio do aviso "pet sumido perto de você". Ficam SEM USO até o servidor
    // ligar PUSH_SOUND_STYLE (petmol | latido): o backend só passa a mandar channel_id destes
    // ids nesse momento. Sons em res/raw/petmol.wav e res/raw/latido.wav. Um canal não muda de
    // som depois de criado — para trocar o som no futuro, crie um canal novo com id novo.
    public static final String PETSUMIDO_CHANNEL_PETMOL = "petsumido_petmol";
    public static final String PETSUMIDO_CHANNEL_LATIDO = "petsumido_latido";

    @Override
    public void onCreate() {
        super.onCreate();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                DEFAULT_NOTIFICATION_CHANNEL_ID,
                "PETMOL",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Lembretes de cuidado e alertas de Pet Sumido");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                createSoundChannel(manager, PETSUMIDO_CHANNEL_PETMOL, "Pet Sumido (som PETMOL)", "petmol");
                createSoundChannel(manager, PETSUMIDO_CHANNEL_LATIDO, "Pet Sumido (latido)", "latido");
            }
        }

        // google-services.json não é versionado (como o keystore) e builds locais/CI podem
        // não ter Firebase configurado. Nesse caso, FirebaseApp nunca inicializa, e a chamada
        // nativa de @capacitor/push-notifications (PushNotifications.register(), disparada ao
        // ativar notificações no onboarding e ao agendar o lembrete da primeira alimentação)
        // lança IllegalStateException("Default FirebaseApp is not initialized...") numa thread
        // de background do bridge do Capacitor. Sem handler, isso derruba o processo inteiro —
        // o app fecha. Isso é uma falha recuperável (push só fica indisponível) e não deve
        // matar o app. Ver docs/MOBILE_RELEASE_CHECKLIST.md ("Bloqueio 1 — Android FCM").
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            if (isMissingFirebaseInit(throwable)) {
                Log.e(TAG, "Push desabilitado: FirebaseApp não inicializado (google-services.json ausente ou "
                    + "mal configurado). Ignorando para não derrubar o app.", throwable);
                return;
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }

    private void createSoundChannel(NotificationManager manager, String id, String name, String rawName) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Aviso de pet sumido perto de você, com som próprio do PETMOL");
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/" + rawName), attrs);
        manager.createNotificationChannel(channel);
    }

    private boolean isMissingFirebaseInit(Throwable throwable) {
        Throwable cause = throwable;
        while (cause != null) {
            String message = cause.getMessage();
            if (cause instanceof IllegalStateException && message != null && message.contains("FirebaseApp")) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }
}
