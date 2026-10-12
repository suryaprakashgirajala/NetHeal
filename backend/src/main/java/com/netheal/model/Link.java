package com.netheal.model;

public class Link {

    private final Router source;
    private final Router destination;
    private int cost;
    private boolean active;

    public Link(Router source, Router destination, int cost) {
        if (cost <= 0) {
            throw new IllegalArgumentException("Link cost must be greater than zero.");
        }

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

    public void setCost(int cost) {
        if (cost <= 0) {
            throw new IllegalArgumentException("Link cost must be greater than zero.");
        }

        this.cost = cost;
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
