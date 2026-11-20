package com.rkdigitals.jobflow;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin that lets the web app update the home-screen widgets.
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Make sure widgets show the latest figures when the person leaves the app.
        JobFlowWidgets.refreshAll(this);
    }
}
