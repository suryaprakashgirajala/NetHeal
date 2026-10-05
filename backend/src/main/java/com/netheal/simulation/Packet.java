package com.netheal.simulation;

public class Packet {

    private final int id;
    private final String source;
    private final String destination;

    private String status;

    public Packet(int id, String source, String destination) {
        this.id = id;
        this.source = source;
        this.destination = destination;
        this.status = "CREATED";
    }

    public int getId() {
        return id;
    }

    public String getSource() {
        return source;
    }

    public String getDestination() {
        return destination;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    @Override
    public String toString() {
        return "Packet{id=" + id +
                ", source='" + source + '\'' +
                ", destination='" + destination + '\'' +
                ", status='" + status + '\'' +
                '}';
    }
}