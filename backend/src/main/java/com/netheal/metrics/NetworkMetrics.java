package com.netheal.metrics;

public class NetworkMetrics {

    private int packetsSent;
    private int packetsDelivered;
    private int packetsFailed;

    private long recoveryTimeMs;

    public NetworkMetrics() {
        packetsSent = 0;
        packetsDelivered = 0;
        packetsFailed = 0;
        recoveryTimeMs = 0;
    }

    public void recordPacketSent() {
        packetsSent++;
    }

    public void recordPacketDelivered() {
        packetsDelivered++;
    }

    public void recordPacketFailed() {
        packetsFailed++;
    }

    public void setRecoveryTimeMs(long recoveryTimeMs) {
        this.recoveryTimeMs = recoveryTimeMs;
    }

    public int getPacketsSent() {
        return packetsSent;
    }

    public int getPacketsDelivered() {
        return packetsDelivered;
    }

    public int getPacketsFailed() {
        return packetsFailed;
    }

    public long getRecoveryTimeMs() {
        return recoveryTimeMs;
    }

    public double getPacketDeliveryRate() {

        if (packetsSent == 0) {
            return 0.0;
        }

        return ((double) packetsDelivered / packetsSent) * 100;
    }

    public double getPacketLossRate() {

        if (packetsSent == 0) {
            return 0.0;
        }

        return ((double) packetsFailed / packetsSent) * 100;
    }

    public void displayMetrics() {

        System.out.println("\n===== NETWORK METRICS =====");

        System.out.println(
                "Packets Sent       : " + packetsSent
        );

        System.out.println(
                "Packets Delivered  : " + packetsDelivered
        );

        System.out.println(
                "Packets Failed     : " + packetsFailed
        );

        System.out.printf(
                "Delivery Rate      : %.2f%%%n",
                getPacketDeliveryRate()
        );

        System.out.printf(
                "Packet Loss Rate   : %.2f%%%n",
                getPacketLossRate()
        );

        System.out.println(
                "Recovery Time      : "
                        + recoveryTimeMs + " ms"
        );
    }
}