package com.netheal.model;

public class Link {

    private final Router source;
    private final Router destination;
    private final int cost;
    private boolean active;

    public Link(Router source, Router destination, int cost) {
        this.source = source;
        this.destination = destination;
        this.cost = cost;
        this.active = true;
    }

    public Router getSource() {
        return source;
    }

    public Router getDestination() {
        return destination;
    }

    public int getCost() {
        return cost;
    }

    public boolean isActive() {
        return active;
    }

    public void fail() {
        active = false;
    }

    public void recover() {
        active = true;
    }

    @Override
    public String toString() {
        return source.getId() + " <-> " +
                destination.getId() +
                " (Cost: " + cost +
                ", Status: " +
                (active ? "ACTIVE" : "FAILED") + ")";
    }
}