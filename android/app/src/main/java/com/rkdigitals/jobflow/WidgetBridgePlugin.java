package com.rkdigitals.jobflow;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives a small summary from the web app (counts and labels only, no
 * customer details) and stores it for the widgets, then redraws them.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(JobFlowWidgets.PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(JobFlowWidgets.KEY_SNAPSHOT, snapshot.toString()).apply();
        JobFlowWidgets.refreshAll(context);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(JobFlowWidgets.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        JobFlowWidgets.refreshAll(context);
        call.resolve();
    }
}
