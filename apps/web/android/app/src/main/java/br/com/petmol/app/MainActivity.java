package br.com.petmol.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais precisam ser registrados antes do super.onCreate.
        registerPlugin(TikTokEventsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
