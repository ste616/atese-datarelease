#!/usr/bin/perl

use JSON;
use Data::Dumper;
use strict;

# Take all the JSON files in a specified directory, average the data in
# frequency, and then write out a new file for the averaged data.

my $dirname = $ARGV[0];
my $averaging = $ARGV[1];

# Start the JSON.
my $json = JSON->new;

# Get a list of all the JSON files in the specified directory.
opendir my ($dh), $dirname or die "Can't open dir $dirname: $!";
my @files = readdir $dh;
closedir $dh;

for (my $i = 0; $i <= $#files; $i++) {
    if ($files[$i] =~ /^\./) {
	# This is a hidden file, so we ignore it.
	next;
    } elsif ($files[$i] =~ /averaged/) {
	# This is not the un-averaged data.
	next;
    }

    my $avfile = $files[$i];
    $avfile =~ s/^(.*)\.json/$1.averaged$averaging.json/;
    if (-e "$dirname/$avfile") {
	next;
    }
    print $files[$i]."\n";
    print " averaging to file $avfile\n";

    # Check if we've already done the averaging.
    
    # Open the JSON file.
    my $pfile = `cat $dirname/$files[$i]`;
    my $djson = from_json $pfile;

    # Go through the flux density data.
    if ($djson->{'fluxDensityData'}) {
	my $farray = $djson->{'fluxDensityData'};
	for (my $j = 0; $j <= $#{$farray}; $j++) {
	    #	    print "Stokes ".$farray->[$j]->{'stokes'}."\n";
	    #	    print Dumper($farray->[$j]->{'data'});
	    my $na = &average_data($farray->[$j]->{'data'}, $averaging);
	    $farray->[$j]->{'data'} = $na;
	}
    }

    # Write out the new data.
    open(OUT, ">".$dirname."/".$avfile);
    print OUT $json->encode($djson);
    close(OUT);
}

sub average_data {
    my $aref = shift;
    my $avg = shift;

    # Change the average to GHz from MHz.
    $avg /= 1000;

    # The new array.
    my @narr;

    my @f;
    my @a;
    my $s = 0;
    for (my $i = 0; $i <= $#{$aref}; $i++) {
	my $tf = $aref->[$i]->[0];
	my $ta = $aref->[$i]->[1];
	if (($s == 1) &&
	    ($tf < ($f[0] + $avg))) {
	    push @f, $tf;
	    push @a, $ta;
	} elsif ($s == 1) {
	    my $avf = &avgarr(\@f);
	    my $ava = &avgarr(\@a);
	    push @narr, [ $avf, $ava ];
	    $s = 0;
	}
	if ($s == 0) {
	    @f = ( $tf );
	    @a = ( $ta );
	    $s = 1;
	}
    }

    return \@narr;
}

sub avgarr {
    my $aref = shift;

    my $s = $aref->[0];
    my $n = 1;

    for (my $i = 1; $i <= $#{$aref}; $i++) {
	$s += $aref->[$i];
	$n++;
    }

    return ($s / $n);
}
