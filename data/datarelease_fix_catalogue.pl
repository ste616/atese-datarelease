#!/usr/bin/perl

use lib '/n/ste616/usr/share/perl/5.14.2';
use Astro::Coord::ECI;
use Astro::Coord::ECI::Sun;
use Astro::Time;
use JSON;
use strict;

# This script is used to go through an un-fixed catalogue and
# insert into the JSON information about the min and max
# frequencies in the data from which the fits were derived. This
# will stop us from evaluating the fit at frequencies outside
# the valid regions.
# It also includes the array configurations now, and the solar
# separation angle.

# ATCA location.
my ($lat, $lon, $alt) = ( deg2rad(-30.3128846), deg2rad(149.5501388), (236.87 / 1000.0) );
my $loc = Astro::Coord::ECI->geodetic($lat, $lon, $alt);

# Read in the catalogue.
my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# The catalogue of all sources we have.
my $catalogue;
my $catname = $od."/datarelease_catalogue.json";

if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    $catalogue = {};
}

my @sources = keys %{$catalogue};
for (my $i = 0; $i <= $#sources; $i++) {
    printf "Fixing source %s (%d / %d)\n", $sources[$i], ($i + 1), ($#sources + 1);
    my $c = $catalogue->{$sources[$i]}->{"fluxDensityFit"};
    my $e = $catalogue->{$sources[$i]}->{"epochs"};
    my $m = $catalogue->{$sources[$i]}->{"mjd"};
    my $r = $catalogue->{$sources[$i]}->{"rightAscension"};
    my $d = $catalogue->{$sources[$i]}->{"declination"};
    if (!defined $catalogue->{$sources[$i]}->{"arrayConfigurations"}) {
	$catalogue->{$sources[$i]}->{"arrayConfigurations"} = [];
    }
    my $a = $catalogue->{$sources[$i]}->{"arrayConfigurations"};
    if (!defined $catalogue->{$sources[$i]}->{"solarAngles"}) {
	$catalogue->{$sources[$i]}->{"solarAngles"} = [];
    }
    my $s = $catalogue->{$sources[$i]}->{"solarAngles"};

    for (my $j = 0; $j <= $#{$e}; $j++) {
	# Calculate the solar position.
	my $t = mjd2epoch($m->[$j]);
	my $sun = Astro::Coord::ECI::Sun->universal($t);
	# And the distance between it and our source.
	my $p = Astro::Coord::ECI->equatorial(
	    str2rad($r->[$j], "H"), str2rad($d->[$j], "D"), 1e12, $t);
	my $sep = rad2deg(abs($loc->angle($sun, $p)));
	$s->[$j] = $sep;

	# Get info from the data.
	my $fname = $od."/".$e->[$j]."/".$sources[$i]."_".$e->[$j].".averaged64.json";
	$c->[$j]->{"frequencyRange"} = [ -1, -1 ];
	$c->[$j]->{"alphas5.5"} = &fluxModel2Alphas($c->[$j]->{'fitCoefficients'}, 5.5, 1);
	unshift @{$c->[$j]->{"alphas5.5"}}, &fluxModel2Density($c->[$j]->{"fitCoefficients"}, 5.5);
	$c->[$j]->{"closest5.5"} = [];
	$a->[$j] = "";
	if (-e $fname) {
	    open(J, $fname);
	    my $fdtxt = <J>;
	    close(J);
	    my $fds = from_json $fdtxt;
	    $a->[$j] = $fds->{"arrayConfiguration"};
	    my $fd = $fds->{"fluxDensityData"};
	    for (my $k = 0; $k <= $#{$fd}; $k++) {
		if ($fd->[$k]->{"stokes"} eq "I" &&
		    $fd->[$k]->{"mode"} eq "vector") {
		    my $lfd = $#{$fd->[$k]->{"data"}};
		    $c->[$j]->{"frequencyRange"} = [
			$fd->[$k]->{"data"}->[0]->[0],
			$fd->[$k]->{"data"}->[$lfd]->[0]
			];
		    $c->[$j]->{"closest5.5"} = $fd->[$k]->{"data"}->[0];
		    my $diff1 = $c->[$j]->{"closest5.5"}->[0] - 5.5;
		    for (my $kk = 1; $kk <= $lfd; $kk++) {
			my $diff2 = $fd->[$k]->{"data"}->[$kk]->[0] - 5.5;
			if (abs($diff2) < abs($diff1)) {
			    $diff1 = $diff2;
			    $c->[$j]->{"closest5.5"} = $fd->[$k]->{"data"}->[$kk];
			}
		    }
		}
	    }
	}
    }
}

my $outcat = $od."/datarelease_catalogue_fixed.json";
open(O, ">".$outcat);
print O to_json $catalogue;
close(O);

sub fluxModel2Alphas {
    my $model = shift;
    my $referenceFreq = shift;
    my $basee = shift;

    my $isLog = ($model->[$#{$model}] eq "log");
    if (!$isLog) {
	return [];
    }
    my $f = $referenceFreq;
    my $a = ($#{$model} >= 2) ? $model->[1] : 0;
    my $b = ($#{$model} >= 3) ? $model->[2] : 0;
    my $c = ($#{$model} == 4) ? $model->[3] : 0;
    my $alphas = [];
    if ($#{$model} >= 2) {
	push @{$alphas}, $a;
	if ($#{$model} >= 3) {
	    my $a2 = $b;
	    if ($basee) {
		$a2 *= log(exp(1)) / log(10.0);
	    }
	    $alphas->[0] += (($basee) ? log($f) : log($f) / log(10.0)) * 2 * $a2;
	    push @{$alphas}, $a2;
	    if ($#{$model} == 4) {
		my $a3 = $c;
		if ($basee) {
		    $a3 *= (log(exp(1)) / log(10.0)) ** 2;
		}
		$alphas->[0] += (($basee) ? (log($f) ** 2) : (log($f) / log(10.0)) ** 2) * 3 * $a3;
		$alphas->[1] += (($basee) ? log($f) : log($f) / log(10.0)) * 3 * $a3;
		push @{$alphas}, $a3;
	    }
	}
    }
    return $alphas;
}

sub fluxModel2Density {
    my $model = shift;
    my $frequency = shift;

    my $f = $frequency;
    my $isLog = ($model->[$#{$model}] eq "log");
    if ($isLog) {
	$f = log($f) / log(10.0);
    }
    my $s = $model->[0];
    for (my $i = 1; $i < $#{$model}; $i++) {
	$s += $model->[$i] * ($f ** $i);
    }
    if ($isLog) {
	$s = 10 ** $s;
    }
    return $s;
}
